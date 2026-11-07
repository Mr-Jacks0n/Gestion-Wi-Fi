"""Automation API — CRUD on automation settings + manual triggers for testing."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.core.dependencies import get_current_admin
from app.models.user import User
from app.models.automation_setting import AutomationSetting

router = APIRouter(prefix="/api/automation", tags=["Automation"])


class AutomationSettingResponse(BaseModel):
    key: str
    value: str
    label: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class AutomationSettingUpdate(BaseModel):
    value: str


@router.get("/settings", response_model=list[AutomationSettingResponse])
def list_automation_settings(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all configurable automation settings (admin only)."""
    settings = db.query(AutomationSetting).order_by(AutomationSetting.key).all()
    return [AutomationSettingResponse.model_validate(s) for s in settings]


@router.put("/settings/{key}", response_model=AutomationSettingResponse)
def update_automation_setting(
    key: str,
    data: AutomationSettingUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update an automation setting value (admin only)."""
    setting = db.query(AutomationSetting).filter(AutomationSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Paramètre introuvable")

    # Validate numeric value
    try:
        int_val = int(data.value)
        if int_val < 0:
            raise ValueError("Valeur négative")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="La valeur doit être un entier positif")

    setting.value = data.value
    db.commit()
    db.refresh(setting)
    return AutomationSettingResponse.model_validate(setting)


@router.post("/trigger/daily-report")
def trigger_daily_report(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Manually trigger the daily report notification (admin only — for testing)."""
    from app.services.automation_service import generate_daily_internal_report_notification
    generate_daily_internal_report_notification(db)
    return {"message": "Rapport journalier généré et envoyé aux administrateurs."}


@router.post("/trigger/credit-alerts")
def trigger_credit_alerts(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Manually trigger the overdue credit alerts check (admin only — for testing)."""
    from app.services.automation_service import check_overdue_credits
    count = check_overdue_credits(db)
    return {"message": f"{count} alerte(s) crédit impayé envoyée(s)."}
