from datetime import datetime
from pydantic import BaseModel, ConfigDict
from decimal import Decimal

class ExpenseCreate(BaseModel):
    description: str
    amount: Decimal
    category: str
    payment_source: str = "cash"

class ExpenseResponse(BaseModel):
    id: int
    description: str
    amount: Decimal
    category: str
    payment_source: str
    created_at: datetime
    created_by_id: int
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
