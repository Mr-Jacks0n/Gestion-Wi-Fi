"""RegisterClosure model - records of daily cash and payment closures by vendors."""

from datetime import datetime

from sqlalchemy import String, ForeignKey, Numeric, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RegisterClosure(Base):
    __tablename__ = "register_closures"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    closed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    expected_cash: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    actual_cash: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    cash_difference: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    expected_wave: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    actual_wave: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    wave_difference: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationship
    vendor = relationship("User", foreign_keys=[vendor_id])

    def __repr__(self) -> str:
        return f"<RegisterClosure #{self.id} for Vendor #{self.vendor_id}>"
