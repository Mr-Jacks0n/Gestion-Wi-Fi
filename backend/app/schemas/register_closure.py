"""RegisterClosure schemas for API request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class RegisterClosureCreate(BaseModel):
    actual_cash: float = Field(..., ge=0)
    actual_wave: float = Field(..., ge=0)
    comment: str | None = Field(None, max_length=500)


class RegisterClosureResponse(BaseModel):
    id: int
    vendor_id: int
    closed_at: datetime
    expected_cash: float
    actual_cash: float
    cash_difference: float
    expected_wave: float
    actual_wave: float
    wave_difference: float
    comment: str | None = None
    vendor_name: str | None = None

    model_config = {"from_attributes": True}
