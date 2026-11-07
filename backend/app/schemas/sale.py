"""Sale schemas for API request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class SaleCreate(BaseModel):
    subscription_type_id: int
    ticket_ids: list[int] | None = None
    quantity: int = 1
    client_name: str | None = None
    client_phone: str | None = Field(default=None, min_length=8, max_length=20, pattern=r"^\+?[0-9\s\-()]+$")
    payment_method: str = "cash"


class SaleCancelRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)
    mark_defective: bool = False


class SaleResponse(BaseModel):
    id: int
    ticket_id: int | None = None
    vendor_id: int
    client_name: str | None
    client_phone: str | None
    payment_method: str
    amount: float
    created_at: datetime
    is_cancelled: bool
    cancelled_by: int | None
    cancel_reason: str | None
    cancelled_at: datetime | None
    ticket_code: str | None = None
    vendor_name: str | None = None
    subscription_type_name: str | None = None
    batch_reference: str | None = None
    replacement_ticket_code: str | None = None
    subscription_duration_hours: int | None = None
    is_paid: bool
    paid_at: datetime | None = None
    ticket_status: str | None = None

    model_config = {"from_attributes": True}


class ClientStatsResponse(BaseModel):
    name: str | None = None
    phone: str | None = None
    tickets_bought: int = 0
    total_spent: float = 0.0
    last_purchase: datetime | None = None
    favorite_subscription: str | None = None
    days_inactive: int = 0


class SaleClientUpdate(BaseModel):
    client_name: str | None = None
    client_phone: str | None = Field(default=None, min_length=8, max_length=20, pattern=r"^\+?[0-9\s\-()]+$")


class ClientUpdate(BaseModel):
    old_name: str | None = None
    old_phone: str | None = None
    new_name: str | None = None
    new_phone: str | None = None



