"""Register closures API - daily sales reconciliation for vendors."""

from datetime import datetime, date, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.sale import Sale
from app.models.register_closure import RegisterClosure
from app.schemas.register_closure import RegisterClosureCreate, RegisterClosureResponse
from app.services.backup_service import trigger_background_backup

router = APIRouter(prefix="/api/register-closures", tags=["Register Closures"])


def get_today_expected_sales(db: Session, vendor_id: int) -> tuple[float, float]:
    """Calculate expected cash and wave sales for a vendor today since midnight UTC."""
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    
    cash_total = db.query(func.sum(Sale.amount)).filter(
        Sale.vendor_id == vendor_id,
        Sale.payment_method == "cash",
        Sale.is_cancelled == False,
        Sale.created_at >= today_start
    ).scalar() or 0.0
    
    wave_total = db.query(func.sum(Sale.amount)).filter(
        Sale.vendor_id == vendor_id,
        Sale.payment_method == "wave",
        Sale.is_cancelled == False,
        Sale.created_at >= today_start
    ).scalar() or 0.0
    
    return float(cash_total), float(wave_total)


@router.get("/today-status")
def get_today_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the vendor's expected sales for today and last closure status."""
    expected_cash, expected_wave = get_today_expected_sales(db, current_user.id)
    
    # Check if a closure was already submitted today by this vendor
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    last_closure = db.query(RegisterClosure).filter(
        RegisterClosure.vendor_id == current_user.id,
        RegisterClosure.closed_at >= today_start
    ).order_by(RegisterClosure.closed_at.desc()).first()
    
    response_closure = None
    if last_closure:
        response_closure = RegisterClosureResponse.model_validate(last_closure)
        response_closure.vendor_name = current_user.full_name
        
    return {
        "expected_cash": expected_cash,
        "expected_wave": expected_wave,
        "already_closed": last_closure is not None,
        "last_closure": response_closure
    }


@router.post("/", response_model=RegisterClosureResponse, status_code=201)
def create_register_closure(
    data: RegisterClosureCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a cash/payment register closure for the current vendor."""
    expected_cash, expected_wave = get_today_expected_sales(db, current_user.id)
    
    cash_diff = data.actual_cash - expected_cash
    wave_diff = data.actual_wave - expected_wave
    
    closure = RegisterClosure(
        vendor_id=current_user.id,
        expected_cash=expected_cash,
        actual_cash=data.actual_cash,
        cash_difference=cash_diff,
        expected_wave=expected_wave,
        actual_wave=data.actual_wave,
        wave_difference=wave_diff,
        comment=data.comment
    )
    
    db.add(closure)
    db.commit()
    db.refresh(closure)
    
    # Audit log
    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action="register_closure.create",
        entity_type="register_closure",
        entity_id=closure.id,
        details={
            "expected_cash": expected_cash,
            "actual_cash": data.actual_cash,
            "cash_diff": cash_diff,
            "expected_wave": expected_wave,
            "actual_wave": data.actual_wave,
            "wave_diff": wave_diff
        }
    )
    
    # Trigger backup asynchronously
    trigger_background_backup(trigger="closure")

    response = RegisterClosureResponse.model_validate(closure)
    response.vendor_name = current_user.full_name
    return response


@router.get("/", response_model=list[RegisterClosureResponse])
def list_register_closures(
    vendor_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List register closures (Admins see all, Vendors see only their own)."""
    query = db.query(RegisterClosure)
    
    if current_user.role == UserRole.VENDOR:
        query = query.filter(RegisterClosure.vendor_id == current_user.id)
    elif vendor_id:
        query = query.filter(RegisterClosure.vendor_id == vendor_id)
        
    closures = query.order_by(RegisterClosure.closed_at.desc()).all()
    
    results = []
    for c in closures:
        resp = RegisterClosureResponse.model_validate(c)
        resp.vendor_name = c.vendor.full_name
        results.append(resp)
        
    return results
