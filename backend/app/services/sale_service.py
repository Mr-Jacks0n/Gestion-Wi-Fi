"""Sale service — selling tickets (FIFO) and cancellation."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.sale import Sale
from app.models.ticket import Ticket, TicketStatus
from app.services.ticket_service import get_vendor_next_ticket


def create_sales(
    db: Session,
    vendor_id: int,
    subscription_type_id: int,
    payment_method: str,
    client_name: str | None = None,
    client_phone: str | None = None,
    ticket_ids: list[int] | None = None,
    quantity: int = 1,
    allow_compensation: bool = False,
) -> list[Sale]:
    """
    Create one or more sales by auto-assigning next available tickets (FIFO) or using specific tickets.
    """
    from app.models.user import User, UserRole

    # Normalize client inputs (trim only)
    if client_name:
        client_name = client_name.strip()
        if client_name == "":
            client_name = None
    if client_phone:
        client_phone = client_phone.strip()
        if client_phone == "":
            client_phone = None

    # Sync client names by phone number
    if client_phone:
        if not client_name:
            # Look up most recent sale with this phone number having a name
            last_sale = (
                db.query(Sale)
                .filter(Sale.client_phone == client_phone, Sale.client_name != None, Sale.client_name != "")
                .order_by(Sale.created_at.desc())
                .first()
            )
            if last_sale:
                client_name = last_sale.client_name
        else:
            # Propagate name update to all previous sales with this phone number
            db.query(Sale).filter(Sale.client_phone == client_phone).update(
                {"client_name": client_name}, synchronize_session=False
            )

    user = db.query(User).filter(User.id == vendor_id).first()
    is_admin = user is not None and user.role == UserRole.ADMIN

    if payment_method.lower() == "compensation" and not allow_compensation:
        raise ValueError("Seuls les administrateurs peuvent initier des ventes de dédommagement.")

    # 1. Retrieve the tickets to sell
    if ticket_ids is not None and len(ticket_ids) > 0:
        if is_admin:
            # Admins can sell any AVAILABLE ticket from central stock
            tickets = db.query(Ticket).filter(
                Ticket.id.in_(ticket_ids),
                Ticket.subscription_type_id == subscription_type_id,
                Ticket.status == TicketStatus.AVAILABLE
            ).all()
        else:
            # Vendors can only sell tickets assigned to them
            tickets = db.query(Ticket).filter(
                Ticket.id.in_(ticket_ids),
                Ticket.assigned_to == vendor_id,
                Ticket.subscription_type_id == subscription_type_id,
                Ticket.status == TicketStatus.ASSIGNED,
            ).all()
            
        if len(tickets) != len(ticket_ids):
            raise ValueError("Un ou plusieurs tickets sélectionnés ne sont pas disponibles ou ne vous sont pas attribués")
    else:
        if is_admin:
            # Admins get next AVAILABLE tickets from central stock (FIFO)
            tickets = db.query(Ticket).filter(
                Ticket.subscription_type_id == subscription_type_id,
                Ticket.status == TicketStatus.AVAILABLE,
                ~Ticket.code.ilike("TEST%")
            ).order_by(Ticket.id).limit(quantity).all()
        else:
            # Vendors get next ASSIGNED tickets (FIFO)
            tickets = db.query(Ticket).filter(
                Ticket.assigned_to == vendor_id,
                Ticket.subscription_type_id == subscription_type_id,
                Ticket.status == TicketStatus.ASSIGNED,
                ~Ticket.code.ilike("TEST%")
            ).order_by(Ticket.id).limit(quantity).all()

        if len(tickets) < quantity:
            raise ValueError(f"Stock insuffisant : seulement {len(tickets)} ticket(s) disponible(s)")

    # 2. Record each sale
    sales = []
    now = datetime.now(timezone.utc)
    for ticket in tickets:
        ticket.status = TicketStatus.SOLD
        ticket.sold_at = now
        
        # Compensation / free tickets have 0.0 amount
        if payment_method.lower() == "compensation":
            amount = 0.0
        else:
            amount = float(ticket.subscription_type.price)
        
        sub_type_name = ticket.subscription_type.name if ticket.subscription_type else None
        sub_duration = ticket.subscription_type.duration_hours if ticket.subscription_type else None
        batch_ref = ticket.batch.reference if ticket.batch else None
        is_paid = payment_method.lower() != "credit"

        sale = Sale(
            ticket_id=ticket.id,
            vendor_id=vendor_id,
            client_name=client_name,
            client_phone=client_phone,
            payment_method=payment_method,
            amount=amount,
            is_paid=is_paid,
            ticket_code=ticket.code,
            subscription_type_name=sub_type_name,
            subscription_duration_hours=sub_duration,
            batch_reference=batch_ref,
        )
        db.add(sale)
        sales.append(sale)
        
    db.commit()
    for sale in sales:
        db.refresh(sale)

    # Perform contacts merging/normalization
    merge_existing_contacts(db)

    # 3. Check for low central stock warning
    from sqlalchemy import func
    central_stock_count = db.query(func.count(Ticket.id)).filter(
        Ticket.subscription_type_id == subscription_type_id,
        Ticket.status == TicketStatus.AVAILABLE
    ).scalar() or 0
    if central_stock_count < 10:
        from app.models.subscription_type import SubscriptionType
        sub_type = db.query(SubscriptionType).filter(SubscriptionType.id == subscription_type_id).first()
        sub_name = sub_type.name if sub_type else f"ID {subscription_type_id}"
        
        # Check if an unread notification exists to avoid spamming
        from app.models.notification import Notification
        existing_notif = db.query(Notification).filter(
            Notification.title == f"Alerte Stock Bas : {sub_name}",
            Notification.is_read == False
        ).first()
        if not existing_notif:
            from app.models.user import User, UserRole
            admins = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).all()
            for admin in admins:
                notif = Notification(
                    user_id=admin.id,
                    title=f"Alerte Stock Bas : {sub_name}",
                    message=f"Le stock central de tickets pour '{sub_name}' est faible : seulement {central_stock_count} restants."
                )
                db.add(notif)
            db.commit()

    # Automatisation 1 : réapprovisionnement automatique si stock vendeur sous le seuil
    from app.services.automation_service import check_and_trigger_auto_resupply
    check_and_trigger_auto_resupply(db, vendor_id=vendor_id, subscription_type_id=subscription_type_id)

    return sales


def cancel_sale(
    db: Session,
    sale_id: int,
    cancelled_by: int,
    reason: str,
    mark_defective: bool = False,
) -> tuple[Sale, Ticket | None]:
    """Cancel a sale (admin only). The ticket goes back to assigned status or defective status."""
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise ValueError("Vente introuvable")
    if sale.is_cancelled:
        raise ValueError("Cette vente est déjà annulée")
        
    ticket = db.query(Ticket).filter(Ticket.id == sale.ticket_id).first()
    if ticket and ticket.status == TicketStatus.DEFECTIVE:
        raise ValueError("Le ticket de cette vente est déjà marqué comme défectueux")

    # Record cancellation reason and operator
    sale.cancelled_by = cancelled_by
    sale.cancel_reason = reason
    sale.cancelled_at = datetime.now(timezone.utc)

    new_ticket = None
    if ticket:
        if mark_defective:
            # Replaced / Defective: DO NOT cancel the sale financially!
            # Keep is_cancelled = False to preserve revenue, vendor statistics, and client list grouping.
            sale.is_cancelled = False
            ticket.status = TicketStatus.DEFECTIVE
            
            # Auto-assign replacement ticket
            try:
                replacement_sales = create_sales(
                    db=db,
                    vendor_id=sale.vendor_id,
                    subscription_type_id=ticket.subscription_type_id,
                    payment_method="compensation",
                    client_name=sale.client_name,
                    client_phone=sale.client_phone,
                    quantity=1,
                    allow_compensation=True
                )
                if replacement_sales:
                    new_ticket = replacement_sales[0].ticket
            except ValueError as e:
                raise ValueError(
                    f"Le ticket a été marqué comme défectueux, mais la réattribution automatique a échoué par manque de stock : {str(e)}"
                )
        else:
            # Normal cancel (refund / void)
            sale.is_cancelled = True
            # Return ticket to its original status:
            # - AVAILABLE if it was from central stock (no assignment, typically admin sale)
            # - ASSIGNED if it belonged to a vendor
            if ticket.assigned_to is None:
                ticket.status = TicketStatus.AVAILABLE
            else:
                ticket.status = TicketStatus.ASSIGNED
            
        ticket.sold_at = None

    db.commit()
    db.refresh(sale)
    return sale, new_ticket


def mark_sale_as_paid(db: Session, sale_id: int) -> Sale:
    """Mark a credit sale as paid."""
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise ValueError("Vente introuvable")
    if sale.is_paid:
        raise ValueError("Cette vente est déjà payée")
    sale.is_paid = True
    sale.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sale)
    return sale


def merge_existing_contacts(db: Session):
    """
    Disabled to prevent incorrect automatic contact merging/cleanup.
    """
    pass


def normalize_phone_number(phone: str | None) -> str | None:
    """Normalize phone number by trimming whitespace only."""
    if not phone:
        return None
    cleaned = phone.strip()
    return cleaned if cleaned != "" else None


def update_sale_client(
    db: Session,
    sale_id: int,
    client_name: str | None,
    client_phone: str | None
) -> Sale:
    """Update client information for a specific sale."""
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise ValueError("Vente introuvable.")

    if client_name:
        client_name = client_name.strip()
        if client_name == "":
            client_name = None
    if client_phone:
        client_phone = client_phone.strip()
        if client_phone == "":
            client_phone = None

    sale.client_name = client_name
    sale.client_phone = client_phone
    db.commit()
    db.refresh(sale)
    return sale

