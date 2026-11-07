"""Celery configuration for async tasks."""

from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "advens_manager",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 min hard limit
    task_soft_time_limit=25 * 60,  # 25 min soft limit
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
)

@celery_app.task(bind=True, autoretry_for=(Exception,), retry_kwargs={"max_retries": 3})
def generate_report_pdf_task(self, report_id: int, user_id: int):
    """Async PDF report generation."""
    from app.database import SessionLocal
    from app.services.report_service import generate_report_pdf
    db = SessionLocal()
    try:
        result = generate_report_pdf(report_id, user_id, db)
        return {"status": "success", "report_id": report_id, "file": result}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()

@celery_app.task(bind=True, autoretry_for=(Exception,), retry_kwargs={"max_retries": 3})
def generate_report_excel_task(self, report_id: int, user_id: int):
    """Async Excel report generation."""
    from app.database import SessionLocal
    from app.services.report_service import generate_report_excel
    db = SessionLocal()
    try:
        result = generate_report_excel(report_id, user_id, db)
        return {"status": "success", "report_id": report_id, "file": result}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()

@celery_app.task(bind=True)
def send_webhook_notification_task(self, webhook_url: str, payload: dict):
    """Async webhook delivery."""
    import requests
    import json
    try:
        response = requests.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        return {"status": "delivered", "url": webhook_url, "code": response.status_code}
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=min(2 ** self.request.retries * 60, 3600))

@celery_app.task
def send_notification_task(notification_id: int):
    """Send a pending notification asynchronously."""
    from app.database import SessionLocal
    from app.services.notification_service import send_notification
    db = SessionLocal()
    try:
        send_notification(notification_id, db)
    finally:
        db.close()
