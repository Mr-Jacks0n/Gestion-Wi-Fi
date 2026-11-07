"""User schemas for API request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=8, max_length=20)
    email: str | None = None
    role: str = "vendor"


class UserCreate(UserBase):
    password: str = Field(
        ...,
        min_length=8,
        max_length=100,
        description="8 caractères minimum (NIST SP 800-63B : longueur avant complexité)",
    )


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool | None = None


class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class AdminPasswordChange(BaseModel):
    """Admin can change any user's password without knowing the current one."""
    new_password: str = Field(..., min_length=8, max_length=100)


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    phone: str
    email: str | None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfileResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserWithStats(UserResponse):
    """User response with performance statistics."""
    total_sales: int = 0
    total_revenue: float = 0
    stock_count: int = 0


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    action: str
    entity_type: str
    entity_id: int | None = None
    details: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

