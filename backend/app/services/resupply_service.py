"""Resupply service — vendor stock requests and admin processing."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.resupply import ResupplyRequest, ResupplyStatus
from app.services.ticket_service import bulk_assign_tickets


def create_resupply_request(
    db: Session,
    vendor_id: int,
    subscription_type_id: int,
    quantity: int,
    auto_triggered: bool = False,
) -> ResupplyRequest:
    """Create a new resupply request from a vendor."""
    from app.models.user import User, UserRole
    # Check if user is admin
    user = db.query(User).filter(User.id == vendor_id).first()
    if user and user.role == UserRole.ADMIN:
        raise ValueError("Les administrateurs vendent directement depuis le stock central et n'ont pas besoin de réapprovisionnement.")

    existing = (
        db.query(ResupplyRequest)
        .filter(
            ResupplyRequest.vendor_id == vendor_id,
            ResupplyRequest.subscription_type_id == subscription_type_id,
            ResupplyRequest.status == ResupplyStatus.PENDING,
        )
        .first()
    )
    if existing:
        raise ValueError("Une demande en attente existe déjà pour ce type d'abonnement")

    request = ResupplyRequest(
        vendor_id=vendor_id,
        subscription_type_id=subscription_type_id,
        quantity=quantity,
    )
    db.add(request)
    db.flush()  # get request.id first

    # Notify all admins of the new request
    from app.models.user import User, UserRole
    from app.models.notification import Notification
    from app.models.subscription_type import SubscriptionType
    
    vendor = db.query(User).filter(User.id == vendor_id).first()
    sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == subscription_type_id).first()
    vendor_name = vendor.full_name if vendor else "Vendeur"
    sub_name = sub_type.name if sub_type else "Forfait"
    
    admins = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).all()
    for admin in admins:
        notif = Notification(
            user_id=admin.id,
            title="Nouvelle demande de réapprovisionnement",
            message=f"Le vendeur {vendor_name} a demandé {quantity} tickets de '{sub_name}'."
        )
        db.add(notif)

    db.commit()
    db.refresh(request)

    # Automatisation 2 : tenter l'approbation automatique si stock central suffisant
    from app.services.automation_service import try_auto_approve_resupply
    try_auto_approve_resupply(db, request)
    db.refresh(request)

    return request


def process_resupply_request(
    db: Session,
    request_id: int,
    action: str,
    processed_by: int,
    rejection_reason: str | None = None,
    auto_triggered: bool = False,
) -> ResupplyRequest:
    """Approve or reject a resupply request."""
    request = db.query(ResupplyRequest).filter(ResupplyRequest.id == request_id).first()
    if not request:
        raise ValueError("Demande introuvable")
    if request.status != ResupplyStatus.PENDING:
        raise ValueError("Cette demande a déjà été traitée")

    now = datetime.now(timezone.utc)

    if action == "approved":
        # Assign tickets to the vendor
        try:
            bulk_assign_tickets(
                db,
                vendor_id=request.vendor_id,
                subscription_type_id=request.subscription_type_id,
                quantity=request.quantity,
            )
        except ValueError as e:
            raise ValueError(f"Impossible d'approuver : {e}")

        request.status = ResupplyStatus.APPROVED
    elif action == "rejected":
        if not rejection_reason:
            raise ValueError("Un motif de refus est requis")
        request.status = ResupplyStatus.REJECTED
        request.rejection_reason = rejection_reason
    else:
        raise ValueError("Action invalide")

    request.processed_by = processed_by
    request.processed_at = now
    # Notify the vendor of the outcome
    from app.models.notification import Notification
    from app.models.subscription_type import SubscriptionType
    sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == request.subscription_type_id).first()
    sub_name = sub_type.name if sub_type else "Forfait"
    
    status_label = "approuvée" if request.status == ResupplyStatus.APPROVED else "rejetée"
    reason_suffix = f" (Motif : {rejection_reason})" if rejection_reason else ""
    auto_suffix = " automatiquement" if auto_triggered else ""
    
    notif = Notification(
        user_id=request.vendor_id,
        title=f"Demande de réapprovisionnement {status_label}",
        message=f"Votre demande pour {request.quantity} tickets de '{sub_name}' a été {status_label}{auto_suffix}{reason_suffix}."
    )
    db.add(notif)

    db.commit()
    db.refresh(request)
    return request
