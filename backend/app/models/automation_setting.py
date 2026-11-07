"""AutomationSetting model - key/value store for configurable automation parameters."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AutomationSetting(Base):
    __tablename__ = "automation_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<AutomationSetting {self.key}={self.value}>"
