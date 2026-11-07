"""User model — administrators and vendors."""

import enum
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    VENDOR = "vendor"
    TECHNICIAN = "technician"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.VENDOR)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    batches = relationship("Batch", back_populates="admin", foreign_keys="Batch.admin_id")
    assigned_tickets = relationship("Ticket", back_populates="assigned_user", foreign_keys="Ticket.assigned_to")
    sales = relationship("Sale", back_populates="vendor", foreign_keys="Sale.vendor_id")
    resupply_requests = relationship("ResupplyRequest", back_populates="vendor", foreign_keys="ResupplyRequest.vendor_id")
    audit_logs = relationship("AuditLog", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role.value})>"
