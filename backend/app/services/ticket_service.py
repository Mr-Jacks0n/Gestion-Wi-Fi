"""Ticket service — batch import, assignment, and search logic."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.ticket import Ticket, TicketStatus
from app.models.batch import Batch
from app.models.subscription_type import SubscriptionType


def create_batch_with_tickets(
    db: Session,
    reference: str,
    subscription_type_id: int,
    codes: list[str],
    admin_id: int,
    notes: str | None = None,
) -> tuple[Batch, list[str]]:
    """
    Create a batch and import ticket codes.
    Returns (batch, list_of_duplicate_codes).
    Duplicate codes are rejected; valid ones are inserted.
    """
    # Check subscription type exists
    sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == subscription_type_id).first()
    if not sub_type:
        raise ValueError("Type d'abonnement introuvable")

    # Check batch reference uniqueness
    existing = db.query(Batch).filter(Batch.reference == reference).first()
    if existing:
        raise ValueError(f"La référence de lot '{reference}' existe déjà")

    # Deduplicate and check for existing codes
    unique_codes = list(dict.fromkeys(code.strip() for code in codes if code.strip()))
    existing_codes = set(
        row[0]
        for row in db.query(Ticket.code).filter(Ticket.code.in_(unique_codes)).all()
    )
    duplicates = [c for c in unique_codes if c in existing_codes]
    valid_codes = [c for c in unique_codes if c not in existing_codes]

    if not valid_codes:
        raise ValueError("Tous les codes fournis sont des doublons")

    # Create batch
    batch = Batch(
        reference=reference,
        admin_id=admin_id,
        subscription_type_id=subscription_type_id,
        total_tickets=len(valid_codes),
        notes=notes,
    )
    db.add(batch)
    db.flush()

    # Create tickets
    tickets = [
        Ticket(
            code=code,
            batch_id=batch.id,
            subscription_type_id=subscription_type_id,
            status=TicketStatus.AVAILABLE,
        )
        for code in valid_codes
    ]
    db.add_all(tickets)
    db.commit()
    db.refresh(batch)

    return batch, duplicates


def assign_tickets_to_vendor(
    db: Session,
    ticket_ids: list[int],
    vendor_id: int,
) -> list[Ticket]:
    """Assign specific tickets to a vendor."""
    tickets = (
        db.query(Ticket)
        .filter(Ticket.id.in_(ticket_ids), Ticket.status == TicketStatus.AVAILABLE)
        .all()
    )
    if not tickets:
        raise ValueError("Aucun ticket disponible trouvé parmi les IDs fournis")

    now = datetime.now(timezone.utc)
    for ticket in tickets:
        ticket.status = TicketStatus.ASSIGNED
        ticket.assigned_to = vendor_id
        ticket.assigned_at = now

    db.commit()
    return tickets


def bulk_assign_tickets(
    db: Session,
    vendor_id: int,
    subscription_type_id: int,
    quantity: int,
) -> list[Ticket]:
    """Assign N available tickets of a given type to a vendor (FIFO)."""
    tickets = (
        db.query(Ticket)
        .filter(
            Ticket.subscription_type_id == subscription_type_id,
            Ticket.status == TicketStatus.AVAILABLE,
            ~Ticket.code.ilike("TEST%")
        )
        .order_by(Ticket.id)
        .limit(quantity)
        .all()
    )

    if len(tickets) < quantity:
        raise ValueError(
            f"Stock insuffisant : {len(tickets)} tickets disponibles sur {quantity} demandés"
        )

    now = datetime.now(timezone.utc)
    for ticket in tickets:
        ticket.status = TicketStatus.ASSIGNED
        ticket.assigned_to = vendor_id
        ticket.assigned_at = now

    db.commit()
    return tickets


def get_vendor_next_ticket(
    db: Session,
    vendor_id: int,
    subscription_type_id: int,
) -> Ticket | None:
    """Get the first available (assigned) ticket for a vendor — FIFO order."""
    return (
        db.query(Ticket)
        .filter(
            Ticket.assigned_to == vendor_id,
            Ticket.subscription_type_id == subscription_type_id,
            Ticket.status == TicketStatus.ASSIGNED,
        )
        .order_by(Ticket.id)
        .first()
    )


def get_stock_counts(db: Session, vendor_id: int | None = None) -> dict:
    """Get ticket counts grouped by status and subscription type."""
    query = db.query(
        Ticket.subscription_type_id,
        Ticket.status,
        func.count(Ticket.id),
    )
    if vendor_id:
        query = query.filter(Ticket.assigned_to == vendor_id)
    results = query.group_by(Ticket.subscription_type_id, Ticket.status).all()

    counts = {}
    for type_id, status, count in results:
        if type_id not in counts:
            counts[type_id] = {}
        counts[type_id][status] = count
    return counts
