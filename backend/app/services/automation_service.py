"""
Automation service — reusable business logic for automated tasks.
Called both by sale_service (on-the-fly) and by the scheduler (periodic).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.ticket import Ticket, TicketStatus
from app.models.sale import Sale
from app.models.resupply import ResupplyRequest, ResupplyStatus
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.subscription_type import SubscriptionType


def get_automation_setting(db: Session, key: str, default: int) -> int:
    """Read a numeric automation setting from DB, fall back to default."""
    from app.models.automation_setting import AutomationSetting
    row = db.query(AutomationSetting).filter(AutomationSetting.key == key).first()
    if row:
        try:
            return int(row.value)
        except (ValueError, TypeError):
            pass
    return default


def check_and_trigger_auto_resupply(
    db: Session,
    vendor_id: int,
    subscription_type_id: int,
) -> bool:
    """
    After a sale, check if vendor stock for this subscription type is below threshold.
    If so, automatically create a resupply request.
    Returns True if a request was created.
    """
    user = db.query(User).filter(User.id == vendor_id).first()
    if user and user.role == UserRole.ADMIN:
        return False

    threshold = get_automation_setting(db, "AUTO_RESUPPLY_THRESHOLD", 3)
    quantity = get_automation_setting(db, "AUTO_RESUPPLY_QUANTITY", 10)

    # Count tickets still assigned to vendor
    vendor_stock = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.assigned_to == vendor_id,
            Ticket.subscription_type_id == subscription_type_id,
            Ticket.status == TicketStatus.ASSIGNED,
        )
        .scalar()
    ) or 0

    if vendor_stock >= threshold:
        return False

    # Check no pending request already exists
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
        return False

    # Create automatic resupply request
    from app.services.resupply_service import create_resupply_request
    try:
        create_resupply_request(
            db=db,
            vendor_id=vendor_id,
            subscription_type_id=subscription_type_id,
            quantity=quantity,
            auto_triggered=True,
        )
        return True
    except ValueError:
        return False


def try_auto_approve_resupply(db: Session, request: ResupplyRequest) -> bool:
    """
    After a resupply request is created, check if it can be auto-approved.
    Conditions:
      - Central stock >= quantity requested
      - Quantity <= AUTO_APPROVE_MAX_QUANTITY
    Returns True if auto-approved.
    """
    max_qty = get_automation_setting(db, "AUTO_APPROVE_MAX_QUANTITY", 20)

    if request.quantity > max_qty:
        return False

    # Count available tickets in central stock (unassigned)
    central_stock = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.subscription_type_id == request.subscription_type_id,
            Ticket.status == TicketStatus.AVAILABLE,
        )
        .scalar()
    ) or 0

    if central_stock < request.quantity:
        return False

    # Get the first admin user to be the "processor"
    admin = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active == True)
        .order_by(User.id)
        .first()
    )
    if not admin:
        return False

    # Auto approve
    from app.services.resupply_service import process_resupply_request
    try:
        process_resupply_request(
            db=db,
            request_id=request.id,
            action="approved",
            processed_by=admin.id,
            auto_triggered=True,
        )
        return True
    except ValueError:
        return False


def check_overdue_credits(db: Session) -> int:
    """
    Daily task: find unpaid credit sales older than CREDIT_ALERT_DAYS days.
    Sends notifications to admin and vendor if not already sent.
    Returns count of alerts sent.
    """
    credit_days = get_automation_setting(db, "CREDIT_ALERT_DAYS", 3)
    cutoff = datetime.now(timezone.utc) - timedelta(days=credit_days)

    overdue_sales = (
        db.query(Sale)
        .filter(
            Sale.is_paid == False,
            Sale.is_cancelled == False,
            Sale.created_at <= cutoff,
        )
        .all()
    )

    admins = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active == True)
        .all()
    )

    count = 0
    for sale in overdue_sales:
        notif_title = f"Crédit impayé #{sale.id}"

        # Check if unread notification already exists for this sale
        already_notified = (
            db.query(Notification)
            .filter(
                Notification.title == notif_title,
                Notification.is_read == False,
            )
            .first()
        )
        if already_notified:
            continue

        # Gather info
        ticket = sale.ticket
        sub_name = ticket.subscription_type.name if ticket and ticket.subscription_type else "Forfait"
        client = sale.client_name or sale.client_phone or "Client inconnu"
        days_overdue = (datetime.now(timezone.utc) - sale.created_at).days

        msg = (
            f"La vente #{sale.id} ({sub_name}, client: {client}) "
            f"est en crédit impayé depuis {days_overdue} jour(s). "
            f"Montant dû : {float(sale.amount):,.0f} FCFA."
        )

        # Notify admins
        for admin in admins:
            db.add(Notification(user_id=admin.id, title=notif_title, message=msg))

        # Notify vendor
        db.add(Notification(user_id=sale.vendor_id, title=notif_title, message=msg))
        count += 1

    if count:
        db.commit()

    return count


def generate_daily_internal_report_notification(db: Session) -> None:
    """
    Daily task: generate a summary of yesterday''s sales and post it as an
    internal notification to all admins.
    """
    from app.services.report_service import get_sales_data, get_report_dates
    from datetime import date

    today = date.today()
    sales_data = get_sales_data(db, today, today)

    total = len(sales_data)
    revenue = sum(s["amount"] for s in sales_data)
    cash = sum(s["amount"] for s in sales_data if s["payment_method"] == "CASH")
    wave = sum(s["amount"] for s in sales_data if s["payment_method"] == "WAVE")

    msg = (
        f"Rapport journalier automatique du {today.strftime('%d/%m/%Y')} :\n"
        f"• Ventes : {total} ticket(s)\n"
        f"• CA total : {revenue:,.0f} FCFA\n"
        f"  ↳ Espèces : {cash:,.0f} FCFA\n"
        f"  ↳ Wave    : {wave:,.0f} FCFA"
    )

    admins = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).all()
    for admin in admins:
        db.add(Notification(
            user_id=admin.id,
            title=f"📊 Rapport du {today.strftime('%d/%m/%Y')}",
            message=msg,
        ))
    db.commit()
