"""Tickets API — batch import, assignment, search."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.models.user import User, UserRole
from app.models.ticket import Ticket, TicketStatus
from app.models.batch import Batch
from app.models.subscription_type import SubscriptionType
from app.schemas.ticket import (
    BatchCreate, BatchUpdate, BatchResponse, TicketResponse, TicketAssign,
    TicketBulkAssign, SubscriptionTypeCreate, SubscriptionTypeUpdate, SubscriptionTypeResponse,
)
from app.services.ticket_service import (
    create_batch_with_tickets, assign_tickets_to_vendor, bulk_assign_tickets,
)
from app.services.backup_service import trigger_background_backup

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])


# --- Subscription Types ---
@router.get("/subscription-types", response_model=list[SubscriptionTypeResponse])
def list_subscription_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all subscription types."""
    types = db.query(SubscriptionType).order_by(SubscriptionType.name).all()
    return [SubscriptionTypeResponse.model_validate(t) for t in types]


@router.post("/subscription-types", response_model=SubscriptionTypeResponse, status_code=201)
def create_subscription_type(
    data: SubscriptionTypeCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Create a new subscription type (admin only)."""
    existing = db.query(SubscriptionType).filter(SubscriptionType.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce type d'abonnement existe déjà")

    sub_type = SubscriptionType(name=data.name, duration_hours=data.duration_hours, price=data.price)
    db.add(sub_type)
    db.commit()
    db.refresh(sub_type)

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="subscription_type.create",
        entity_type="subscription_type",
        entity_id=sub_type.id,
        details={"name": sub_type.name, "price": sub_type.price, "duration_hours": sub_type.duration_hours},
    )

    return SubscriptionTypeResponse.model_validate(sub_type)


@router.put("/subscription-types/{type_id}", response_model=SubscriptionTypeResponse)
def update_subscription_type(
    type_id: int,
    data: SubscriptionTypeUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a subscription type (admin only)."""
    sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == type_id).first()
    if not sub_type:
        raise HTTPException(status_code=404, detail="Type d'abonnement introuvable")

    if data.name is not None:
        sub_type.name = data.name
    if data.duration_hours is not None:
        sub_type.duration_hours = data.duration_hours
    if data.price is not None:
        sub_type.price = data.price
    if data.is_active is not None:
        sub_type.is_active = data.is_active

    db.commit()
    db.refresh(sub_type)

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="subscription_type.update",
        entity_type="subscription_type",
        entity_id=sub_type.id,
        details={"name": sub_type.name, "price": sub_type.price, "duration_hours": sub_type.duration_hours, "is_active": sub_type.is_active},
    )

    return SubscriptionTypeResponse.model_validate(sub_type)


@router.delete("/subscription-types/{type_id}", status_code=204)
def delete_subscription_type(
    type_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a subscription type (admin only)."""
    sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == type_id).first()
    if not sub_type:
        raise HTTPException(status_code=404, detail="Type d'abonnement introuvable")

    # Check for references in other tables
    from app.models.batch import Batch
    from app.models.ticket import Ticket
    from app.models.resupply import ResupplyRequest

    has_batches = db.query(Batch).filter(Batch.subscription_type_id == type_id).first() is not None
    has_tickets = db.query(Ticket).filter(Ticket.subscription_type_id == type_id).first() is not None
    has_resupplies = db.query(ResupplyRequest).filter(ResupplyRequest.subscription_type_id == type_id).first() is not None

    if has_batches or has_tickets or has_resupplies:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce type d'abonnement car il contient des données historiques. Vous pouvez le désactiver pour le masquer."
        )

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="subscription_type.delete",
        entity_type="subscription_type",
        entity_id=type_id,
        details={"name": sub_type.name},
    )

    db.delete(sub_type)
    db.commit()
    return None



# --- Batches ---
@router.get("/batches", response_model=list[BatchResponse])
def list_batches(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all batches (admin only)."""
    batches = (
        db.query(Batch)
        .order_by(Batch.created_at.desc())
        .all()
    )
    result = []
    for batch in batches:
        data = BatchResponse.model_validate(batch)
        data.subscription_type = SubscriptionTypeResponse.model_validate(batch.subscription_type)
        data.admin_name = batch.admin.full_name
        result.append(data)
    return result


@router.post("/batches", status_code=201)
def create_batch(
    data: BatchCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Import a batch of ticket codes (admin only)."""
    try:
        batch, duplicates = create_batch_with_tickets(
            db=db,
            reference=data.reference,
            subscription_type_id=data.subscription_type_id,
            codes=data.codes,
            admin_id=admin.id,
            notes=data.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="batch.create",
        entity_type="batch",
        entity_id=batch.id,
        details={"reference": batch.reference, "total_tickets": batch.total_tickets},
    )

    # Trigger automated backup
    trigger_background_backup(trigger="import_lot")

    return {
        "batch": BatchResponse.model_validate(batch),
        "imported": batch.total_tickets,
        "duplicates": duplicates,
        "duplicate_count": len(duplicates),
    }


@router.put("/batches/{batch_id}", response_model=BatchResponse)
def update_batch(
    batch_id: int,
    data: BatchUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a batch reference, subscription type / duration, or notes (admin only)."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot introuvable")

    changes = {}

    if data.reference is not None and data.reference.strip() != batch.reference:
        existing = db.query(Batch).filter(Batch.reference == data.reference.strip(), Batch.id != batch_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"La référence de lot '{data.reference}' existe déjà")
        changes["reference"] = {"old": batch.reference, "new": data.reference.strip()}
        batch.reference = data.reference.strip()

    if data.notes is not None:
        batch.notes = data.notes

    if data.subscription_type_id is not None and data.subscription_type_id != batch.subscription_type_id:
        sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == data.subscription_type_id).first()
        if not sub_type:
            raise HTTPException(status_code=404, detail="Type d'abonnement introuvable")
        changes["subscription_type_id"] = {"old": batch.subscription_type_id, "new": data.subscription_type_id}
        batch.subscription_type_id = data.subscription_type_id

        # Update all unsold tickets in this batch to the new subscription_type_id
        db.query(Ticket).filter(
            Ticket.batch_id == batch_id,
            Ticket.status != TicketStatus.SOLD
        ).update({"subscription_type_id": data.subscription_type_id}, synchronize_session=False)

    db.commit()
    db.refresh(batch)

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="batch.update",
        entity_type="batch",
        entity_id=batch.id,
        details={"reference": batch.reference, "changes": changes},
    )

    res = BatchResponse.model_validate(batch)
    res.subscription_type = SubscriptionTypeResponse.model_validate(batch.subscription_type)
    res.admin_name = batch.admin.full_name
    return res


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch(
    batch_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a batch and its tickets (admin only)."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot introuvable")

    # Check if any tickets in this batch have been sold
    from app.models.ticket import Ticket
    sold_ticket = (
        db.query(Ticket)
        .filter(Ticket.batch_id == batch_id, Ticket.status == "sold")
        .first()
    )
    if sold_ticket:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce lot car certains de ses tickets ont déjà été vendus. Annulez les ventes d'abord."
        )

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="batch.delete",
        entity_type="batch",
        entity_id=batch_id,
        details={"reference": batch.reference},
    )

    db.delete(batch)
    db.commit()
    return None


# --- Tickets ---
@router.get("/", response_model=list[TicketResponse])
def list_tickets(
    status: str | None = None,
    subscription_type_id: int | None = None,
    batch_id: int | None = None,
    assigned_to: int | None = None,
    code: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List tickets with filters."""
    query = db.query(Ticket)

    # Vendors can only see their own tickets
    if current_user.role == UserRole.VENDOR:
        query = query.filter(Ticket.assigned_to == current_user.id)
    elif assigned_to:
        query = query.filter(Ticket.assigned_to == assigned_to)

    if status:
        query = query.filter(Ticket.status == status)
    if subscription_type_id:
        query = query.filter(Ticket.subscription_type_id == subscription_type_id)
    if batch_id:
        query = query.filter(Ticket.batch_id == batch_id)
    if code:
        safe_code = code.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Ticket.code.ilike(f"%{safe_code}%"))

    tickets = query.order_by(Ticket.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    result = []
    for ticket in tickets:
        data = TicketResponse.model_validate(ticket)
        data.subscription_type = SubscriptionTypeResponse.model_validate(ticket.subscription_type)
        data.batch_reference = ticket.batch.reference
        if ticket.assigned_user:
            data.assigned_user_name = ticket.assigned_user.full_name
        result.append(data)
    return result


@router.get("/search")
def search_ticket(
    code: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search for a specific ticket by code.

    Un vendeur ne peut consulter que les tickets qui lui sont attribués ;
    admin/technicien ont accès au stock central.
    """
    # Échappe les jokers ILIKE fournis par l'utilisateur (pas de search full-scan)
    safe_code = code.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    query = db.query(Ticket).filter(Ticket.code.ilike(safe_code))

    # Cloisonnement vendeur (comme /api/tickets/)
    if current_user.role == UserRole.VENDOR:
        query = query.filter(Ticket.assigned_to == current_user.id)

    ticket = query.first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    data = TicketResponse.model_validate(ticket)
    data.subscription_type = SubscriptionTypeResponse.model_validate(ticket.subscription_type)
    data.batch_reference = ticket.batch.reference
    if ticket.assigned_user:
        data.assigned_user_name = ticket.assigned_user.full_name
    return data


@router.delete("/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a single ticket (admin only)."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    # Check if this ticket has been sold
    if ticket.status == "sold":
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce ticket car il a déjà été vendu. Annulez la vente d'abord."
        )

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="ticket.delete",
        entity_type="ticket",
        entity_id=ticket_id,
        details={"code": ticket.code, "subscription_type": ticket.subscription_type.name},
    )

    db.delete(ticket)
    db.commit()
    return None


@router.post("/assign")
def assign_tickets(
    data: TicketAssign,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Assign specific tickets to a vendor (admin only)."""
    try:
        tickets = assign_tickets_to_vendor(db, data.ticket_ids, data.vendor_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="tickets.assign",
        entity_type="user",
        entity_id=data.vendor_id,
        details={"count": len(tickets), "ticket_ids": data.ticket_ids},
    )

    return {"message": f"{len(tickets)} tickets attribués", "count": len(tickets)}


@router.post("/bulk-assign")
def bulk_assign(
    data: TicketBulkAssign,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Assign N tickets of a type to a vendor (admin only, FIFO)."""
    try:
        tickets = bulk_assign_tickets(db, data.vendor_id, data.subscription_type_id, data.quantity)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=admin.id,
        action="tickets.bulk_assign",
        entity_type="user",
        entity_id=data.vendor_id,
        details={"count": len(tickets), "subscription_type_id": data.subscription_type_id},
    )

    return {"message": f"{len(tickets)} tickets attribués", "count": len(tickets)}


@router.get("/stock-summary")
def stock_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get stock summary by subscription type."""
    sub_types = db.query(SubscriptionType).filter(SubscriptionType.is_active == True).all()

    result = []
    for st in sub_types:
        available = db.query(func.count(Ticket.id)).filter(
            Ticket.subscription_type_id == st.id,
            Ticket.status == TicketStatus.AVAILABLE,
        ).scalar() or 0

        if current_user.role == UserRole.ADMIN:
            assigned = db.query(func.count(Ticket.id)).filter(
                Ticket.subscription_type_id == st.id,
                Ticket.status == TicketStatus.ASSIGNED,
            ).scalar() or 0
            sold = db.query(func.count(Ticket.id)).filter(
                Ticket.subscription_type_id == st.id,
                Ticket.status == TicketStatus.SOLD,
            ).scalar() or 0
        else:
            assigned = db.query(func.count(Ticket.id)).filter(
                Ticket.subscription_type_id == st.id,
                Ticket.status == TicketStatus.ASSIGNED,
                Ticket.assigned_to == current_user.id,
            ).scalar() or 0
            sold = db.query(func.count(Ticket.id)).filter(
                Ticket.subscription_type_id == st.id,
                Ticket.status == TicketStatus.SOLD,
                Ticket.assigned_to == current_user.id,
            ).scalar() or 0

        result.append({
            "subscription_type": SubscriptionTypeResponse.model_validate(st),
            "available": available,
            "assigned": assigned,
            "sold": sold,
        })
    return result
