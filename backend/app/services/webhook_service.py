"""Webhook service for event delivery."""

from app.celery_app import send_webhook_notification_task
from app.database import SessionLocal
from app.models.webhook import Webhook, WebhookEventType
import json
import logging
import hmac
import hashlib
from datetime import datetime

logger = logging.getLogger(__name__)


def trigger_webhook(event_type: WebhookEventType, payload: dict, user_id: int = None):
    """
    Trigger all active webhooks for a given event type.
    Payload is queued as async task for delivery.
    """
    db = SessionLocal()
    try:
        query = db.query(Webhook).filter(
            Webhook.event_type == event_type,
            Webhook.is_active == True
        )
        if user_id:
            query = query.filter(Webhook.user_id == user_id)
        
        webhooks = query.all()
        for webhook in webhooks:
            # Queue async webhook delivery
            enriched_payload = {
                **payload,
                "event": event_type.value,
                "timestamp": datetime.utcnow().isoformat(),
            }
            if webhook.secret:
                # Add HMAC signature
                signature = hmac.new(
                    webhook.secret.encode(),
                    json.dumps(enriched_payload).encode(),
                    hashlib.sha256
                ).hexdigest()
                headers = {**webhook.headers, "X-Webhook-Signature": signature}
            else:
                headers = webhook.headers
            
            send_webhook_notification_task.delay(
                webhook.url,
                enriched_payload,
                headers
            )
            logger.info(f"Webhook queued: {webhook.url} for {event_type.value}")
    finally:
        db.close()


def register_webhook(user_id: int, event_type: WebhookEventType, url: str, secret: str = None, headers: dict = None):
    """Register a new webhook."""
    db = SessionLocal()
    try:
        webhook = Webhook(
            user_id=user_id,
            event_type=event_type,
            url=url,
            secret=secret,
            headers=headers or {}
        )
        db.add(webhook)
        db.commit()
        logger.info(f"Webhook registered: {url} for {event_type.value}")
        return webhook
    finally:
        db.close()
