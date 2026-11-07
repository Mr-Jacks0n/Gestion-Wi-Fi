"""Resupply API — vendor stock requests and admin processing."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.core.rate_limiting import limiter, RATE_LIMITS
from app.models.user import User, UserRole
from app.models.resupply import ResupplyRequest, ResupplyStatus
from app.schemas.resupply import ResupplyRequestCreate, ResupplyProcessRequest, ResupplyRequestResponse
from app.services.resupply_service import create_resupply_request, process_resupply_request
from app.services.webhook_service import trigger_webhook
from app.models.webhook import WebhookEventType

router = APIRouter(prefix="/api/resupply", tags=["Resupply"])


@router.post("/", response_model=ResupplyRequestResponse, status_code=201)
@limiter.limit(RATE_LIMITS["general"])
def request_resupply(
    request: Request,
    data: ResupplyRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a resupply request (vendor)."""
    try:
        req = create_resupply_request(
            db=db,
            vendor_id=current_user.id,
            subscription_type_id=data.subscription_type_id,
            quantity=data.quantity,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action="resupply.request",
        entity_type="resupply_request",
        entity_id=req.id,
        details={"subscription_type": req.subscription_type.name, "quantity": req.quantity},
    )

    # Trigger webhook for resupply request
    trigger_webhook(
        WebhookEventType.RESUPPLY_REQUESTED,
        {
            "request_id": req.id,
            "vendor_id": current_user.id,
            "vendor_name": current_user.full_name,
            "subscription_type": req.subscription_type.name,
            "quantity": req.quantity,
        },
        user_id=current_user.id
    )

    response = ResupplyRequestResponse.model_validate(req)
    response.vendor_name = current_user.full_name
    response.subscription_type_name = req.subscription_type.name
    return response


@router.get("/", response_model=list[ResupplyRequestResponse])
def list_requests(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List resupply requests."""
    query = db.query(ResupplyRequest)

    if current_user.role == UserRole.VENDOR:
        query = query.filter(ResupplyRequest.vendor_id == current_user.id)

    if status:
        query = query.filter(ResupplyRequest.status == status)

    requests = query.order_by(ResupplyRequest.created_at.desc()).all()

    result = []
    for req in requests:
        data = ResupplyRequestResponse.model_validate(req)
        data.vendor_name = req.vendor.full_name
        data.subscription_type_name = req.subscription_type.name
        result.append(data)
    return result


@router.post("/{request_id}/process", response_model=ResupplyRequestResponse)
@limiter.limit(RATE_LIMITS["general"])
def process_request(
    request: Request,
    request_id: int,
    data: ResupplyProcessRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Approve or reject a resupply request (admin only)."""
    try:
        req = process_resupply_request(
            db=db,
            request_id=request_id,
            action=data.action,
            processed_by=current_user.id,
            rejection_reason=data.rejection_reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action=f"resupply.{data.action}",
        entity_type="resupply_request",
        entity_id=req.id,
        details={"vendor_name": req.vendor.full_name, "subscription_type": req.subscription_type.name, "quantity": req.quantity, "reason": data.rejection_reason},
    )

    # Trigger webhook based on approval/rejection
    event_type = WebhookEventType.RESUPPLY_APPROVED if data.action == "approve" else WebhookEventType.RESUPPLY_REQUESTED
    trigger_webhook(
        event_type,
        {
            "request_id": req.id,
            "vendor_id": req.vendor_id,
            "vendor_name": req.vendor.full_name,
            "subscription_type": req.subscription_type.name,
            "quantity": req.quantity,
            "status": req.status.value,
            "reason": data.rejection_reason,
        },
        user_id=current_user.id
    )

    response = ResupplyRequestResponse.model_validate(req)
    response.vendor_name = req.vendor.full_name
    response.subscription_type_name = req.subscription_type.name
    return response
