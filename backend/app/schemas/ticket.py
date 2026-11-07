"""Ticket and Batch schemas for API request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


# --- Subscription Types ---
class SubscriptionTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    duration_hours: int = Field(..., gt=0)
    price: float = Field(..., gt=0)


class SubscriptionTypeUpdate(BaseModel):
    name: str | None = None
    duration_hours: int | None = Field(None, gt=0)
    price: float | None = Field(None, gt=0)
    is_active: bool | None = None


class SubscriptionTypeResponse(BaseModel):
    id: int
    name: str
    duration_hours: int
    price: float
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Batches ---
class BatchCreate(BaseModel):
    reference: str = Field(..., min_length=1, max_length=50)
    subscription_type_id: int
    codes: list[str] = Field(..., min_length=1)
    notes: str | None = None


class BatchUpdate(BaseModel):
    reference: str | None = Field(None, min_length=1, max_length=50)
    subscription_type_id: int | None = None
    notes: str | None = None



class BatchResponse(BaseModel):
    id: int
    reference: str
    admin_id: int
    subscription_type_id: int
    total_tickets: int
    notes: str | None
    created_at: datetime
    subscription_type: SubscriptionTypeResponse | None = None
    admin_name: str | None = None

    model_config = {"from_attributes": True}


# --- Tickets ---
class TicketResponse(BaseModel):
    id: int
    code: str
    batch_id: int
    subscription_type_id: int
    status: str
    assigned_to: int | None
    assigned_at: datetime | None
    sold_at: datetime | None
    subscription_type: SubscriptionTypeResponse | None = None
    assigned_user_name: str | None = None
    batch_reference: str | None = None

    model_config = {"from_attributes": True}


class TicketAssign(BaseModel):
    vendor_id: int
    ticket_ids: list[int] = Field(..., min_length=1)


class TicketBulkAssign(BaseModel):
    vendor_id: int
    subscription_type_id: int
    quantity: int = Field(..., gt=0)


class TicketSearchQuery(BaseModel):
    code: str | None = None
    status: str | None = None
    batch_id: int | None = None
    subscription_type_id: int | None = None
    assigned_to: int | None = None
    page: int = 1
    per_page: int = 50
