"""Webhook management for real-time event notifications."""

from sqlalchemy import Column, String, Boolean, Integer, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import enum
from app.database import Base


class WebhookEventType(str, enum.Enum):
    """Supported webhook event types."""
    TICKET_CREATED = "ticket.created"
    TICKET_ASSIGNED = "ticket.assigned"
    TICKET_SOLD = "ticket.sold"
    PAYMENT_COMPLETED = "payment.completed"
    PAYMENT_FAILED = "payment.failed"
    RESUPPLY_REQUESTED = "resupply.requested"
    RESUPPLY_APPROVED = "resupply.approved"
    CREDIT_OVERDUE = "credit.overdue"
    REPORT_READY = "report.ready"


class Webhook(Base):
    """Webhook subscription model."""
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    event_type = Column(SQLEnum(WebhookEventType), nullable=False)
    url = Column(String(2048), nullable=False)
    secret = Column(String(256), nullable=True)  # For HMAC signing
    headers = Column(JSONB, default={})  # Custom headers
    is_active = Column(Boolean, default=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Webhook {self.event_type} -> {self.url}>"
