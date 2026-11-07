"""Dashboard API — real-time statistics."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.ticket import Ticket, TicketStatus
from app.models.sale import Sale
from app.models.resupply import ResupplyRequest, ResupplyStatus
from app.models.expense import Expense
from app.schemas.report import DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/", response_model=DashboardStats)
def get_dashboard(
    vendor_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get dashboard statistics."""
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    is_admin = current_user.role == UserRole.ADMIN
    effective_vendor_id = vendor_id if is_admin else current_user.id

    # Central stock (available tickets — not assigned)
    central_stock = db.query(func.count(Ticket.id)).filter(
        Ticket.status == TicketStatus.AVAILABLE
    ).scalar() or 0

    # Vendor stock
    v_stock_query = db.query(func.count(Ticket.id)).filter(
        Ticket.status == TicketStatus.ASSIGNED
    )
    if effective_vendor_id is not None:
        v_stock_query = v_stock_query.filter(Ticket.assigned_to == effective_vendor_id)
    elif not is_admin:
        v_stock_query = v_stock_query.filter(Ticket.assigned_to == current_user.id)
    vendor_stock = v_stock_query.scalar() or 0

    # Today's sales
    sales_query = db.query(Sale).join(User, Sale.vendor_id == User.id).filter(
        Sale.created_at >= today_start,
        Sale.is_cancelled == False,
        User.role != UserRole.TECHNICIAN,
    )
    if effective_vendor_id is not None:
        sales_query = sales_query.filter(Sale.vendor_id == effective_vendor_id)
    elif not is_admin:
        sales_query = sales_query.filter(Sale.vendor_id == current_user.id)

    today_sales_list = sales_query.all()
    today_sales = len(today_sales_list)
    today_revenue = sum(float(s.amount) for s in today_sales_list)
    cash_payments = sum(float(s.amount) for s in today_sales_list if s.payment_method == "cash")
    wave_payments = sum(float(s.amount) for s in today_sales_list if s.payment_method == "wave")

    # Total revenue (Chiffre d'affaires cumulé total)
    total_rev_query = db.query(func.sum(Sale.amount)).join(User, Sale.vendor_id == User.id).filter(
        Sale.is_cancelled == False,
        User.role != UserRole.TECHNICIAN,
    )
    if effective_vendor_id is not None:
        total_rev_query = total_rev_query.filter(Sale.vendor_id == effective_vendor_id)
    elif not is_admin:
        total_rev_query = total_rev_query.filter(Sale.vendor_id == current_user.id)
    total_revenue = float(total_rev_query.scalar() or 0)

    # Total cash payments
    total_cash_query = db.query(func.sum(Sale.amount)).join(User, Sale.vendor_id == User.id).filter(
        Sale.is_cancelled == False,
        Sale.payment_method == "cash",
        User.role != UserRole.TECHNICIAN,
    )
    if effective_vendor_id is not None:
        total_cash_query = total_cash_query.filter(Sale.vendor_id == effective_vendor_id)
    elif not is_admin:
        total_cash_query = total_cash_query.filter(Sale.vendor_id == current_user.id)
    total_cash_payments = float(total_cash_query.scalar() or 0)

    # Total wave payments
    total_wave_query = db.query(func.sum(Sale.amount)).join(User, Sale.vendor_id == User.id).filter(
        Sale.is_cancelled == False,
        Sale.payment_method == "wave",
        User.role != UserRole.TECHNICIAN,
    )
    if effective_vendor_id is not None:
        total_wave_query = total_wave_query.filter(Sale.vendor_id == effective_vendor_id)
    elif not is_admin:
        total_wave_query = total_wave_query.filter(Sale.vendor_id == current_user.id)
    total_wave_payments = float(total_wave_query.scalar() or 0)

    # Total expenses by source
    total_cash_expenses = float(db.query(func.sum(Expense.amount)).filter(Expense.payment_source == "cash").scalar() or 0)
    total_wave_expenses = float(db.query(func.sum(Expense.amount)).filter(Expense.payment_source == "wave").scalar() or 0)

    # Net balances
    cash_balance = total_cash_payments - total_cash_expenses
    wave_balance = total_wave_payments - total_wave_expenses
    global_balance = cash_balance + wave_balance

    # Pending requests
    pending_query = db.query(func.count(ResupplyRequest.id)).filter(
        ResupplyRequest.status == ResupplyStatus.PENDING
    )
    if effective_vendor_id is not None:
        pending_query = pending_query.filter(ResupplyRequest.vendor_id == effective_vendor_id)
    elif not is_admin:
        pending_query = pending_query.filter(ResupplyRequest.vendor_id == current_user.id)
    pending_requests = pending_query.scalar() or 0

    # Totals and Extra detailed stats (admin only)
    total_vendors = 0
    total_tickets = 0
    total_sold = 0
    total_defective = 0
    total_compensation = 0
    top_client_name = None
    top_client_tickets = 0
    top_vendor_name = None
    top_vendor_tickets = 0
    top_subscription_type_name = None
    top_subscription_type_tickets = 0
    top_day_name = None
    top_day_tickets = 0
    vendor_performance = None

    if is_admin:
        total_vendors = db.query(func.count(User.id)).filter(
            User.role == UserRole.VENDOR, User.is_active == True
        ).scalar() or 0
        total_tickets = db.query(func.count(Ticket.id)).scalar() or 0
        total_sold = db.query(func.count(Ticket.id)).filter(
            Ticket.status == TicketStatus.SOLD
        ).scalar() or 0
        total_defective = db.query(func.count(Ticket.id)).filter(
            Ticket.status == TicketStatus.DEFECTIVE
        ).scalar() or 0
        total_compensation = db.query(func.count(Sale.id)).filter(
            Sale.payment_method == "compensation",
            Sale.is_cancelled == False
        ).scalar() or 0

        # Top Client
        top_client = (
            db.query(Sale.client_name, Sale.client_phone, func.count(Sale.id).label("count"))
            .join(User, Sale.vendor_id == User.id)
            .filter(Sale.is_cancelled == False, Sale.client_name != None, Sale.client_name != "", User.role != UserRole.TECHNICIAN)
            .group_by(Sale.client_name, Sale.client_phone)
            .order_by(func.count(Sale.id).desc())
            .first()
        )
        if top_client:
            top_client_name = f"{top_client.client_name} ({top_client.client_phone})" if top_client.client_phone else top_client.client_name
            top_client_tickets = top_client.count

        # Top Vendor
        top_vendor = (
            db.query(User.full_name, func.count(Sale.id).label("count"))
            .join(Sale, Sale.vendor_id == User.id)
            .filter(Sale.is_cancelled == False, User.role != UserRole.TECHNICIAN)
            .group_by(User.full_name)
            .order_by(func.count(Sale.id).desc())
            .first()
        )
        if top_vendor:
            top_vendor_name = top_vendor.full_name
            top_vendor_tickets = top_vendor.count

        # Top Subscription Type
        from app.models.subscription_type import SubscriptionType
        top_sub_type = (
            db.query(SubscriptionType.name, func.count(Sale.id).label("count"))
            .join(Ticket, Ticket.id == Sale.ticket_id)
            .join(SubscriptionType, SubscriptionType.id == Ticket.subscription_type_id)
            .join(User, Sale.vendor_id == User.id)
            .filter(Sale.is_cancelled == False, User.role != UserRole.TECHNICIAN)
            .group_by(SubscriptionType.name)
            .order_by(func.count(Sale.id).desc())
            .first()
        )
        if top_sub_type:
            top_subscription_type_name = top_sub_type.name
            top_subscription_type_tickets = top_sub_type.count

        # Top Day (agnostic weekday aggregation in Python)
        all_sales_dates = (
            db.query(Sale.created_at)
            .join(User, Sale.vendor_id == User.id)
            .filter(Sale.is_cancelled == False, User.role != UserRole.TECHNICIAN)
            .all()
        )
        from collections import Counter
        days_count = Counter()
        day_names = {
            0: "Lundi",
            1: "Mardi",
            2: "Mercredi",
            3: "Jeudi",
            4: "Vendredi",
            5: "Samedi",
            6: "Dimanche"
        }
        for s in all_sales_dates:
            day_idx = s.created_at.weekday()
            days_count[day_idx] += 1
            
        if days_count:
            top_day_idx, top_day_count = days_count.most_common(1)[0]
            top_day_name = day_names[top_day_idx]
            top_day_tickets = top_day_count

        # Vendor leaderboard performance list
        vendors_perf = db.query(
            User.id,
            User.full_name,
            func.count(Sale.id).label("sales_count"),
            func.sum(Sale.amount).label("revenue")
        ).join(Sale, Sale.vendor_id == User.id)\
         .filter(Sale.is_cancelled == False, User.role == UserRole.VENDOR)\
         .group_by(User.id, User.full_name)\
         .order_by(func.sum(Sale.amount).desc())\
         .all()
        
        vendor_performance = [
            {
                "vendor_id": v.id,
                "vendor_name": v.full_name,
                "sales_count": v.sales_count,
                "revenue": float(v.revenue or 0)
            }
            for v in vendors_perf
        ]

    return DashboardStats(
        central_stock=central_stock,
        vendor_stock=vendor_stock,
        today_sales=today_sales,
        today_revenue=today_revenue,
        total_revenue=total_revenue,
        cash_payments=cash_payments,
        wave_payments=wave_payments,
        total_cash_payments=total_cash_payments,
        total_wave_payments=total_wave_payments,
        pending_requests=pending_requests,
        total_vendors=total_vendors,
        total_tickets=total_tickets,
        total_sold=total_sold,
        cash_balance=cash_balance,
        wave_balance=wave_balance,
        global_balance=global_balance,
        total_defective=total_defective,
        total_compensation=total_compensation,
        top_client_name=top_client_name,
        top_client_tickets=top_client_tickets,
        top_vendor_name=top_vendor_name,
        top_vendor_tickets=top_vendor_tickets,
        top_subscription_type_name=top_subscription_type_name,
        top_subscription_type_tickets=top_subscription_type_tickets,
        top_day_name=top_day_name,
        top_day_tickets=top_day_tickets,
        vendor_performance=vendor_performance,
    )


@router.get("/sales-trend")
def get_sales_trend(
    vendor_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get sales trend for the last 7 days."""
    from datetime import timedelta
    is_admin = current_user.role == UserRole.ADMIN
    effective_vendor_id = vendor_id if is_admin else current_user.id
    
    # Last 7 days dates
    today = date.today()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    
    result = []
    for day in days:
        start_dt = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_dt = datetime.combine(day, datetime.max.time()).replace(tzinfo=timezone.utc)
        
        query = db.query(Sale).join(User, Sale.vendor_id == User.id).filter(
            Sale.created_at >= start_dt,
            Sale.created_at <= end_dt,
            Sale.is_cancelled == False,
            User.role != UserRole.TECHNICIAN,
        )
        if effective_vendor_id is not None:
            query = query.filter(Sale.vendor_id == effective_vendor_id)
        elif not is_admin:
            query = query.filter(Sale.vendor_id == current_user.id)
            
        sales = query.all()
        result.append({
            "date": day.strftime("%d/%m"),
            "revenue": sum(float(s.amount) for s in sales),
            "sales_count": len(sales),
        })
        
    return result


@router.get("/hourly-trend")
def get_hourly_trend(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get sales hourly trend (last 30 days) to identify peak hours."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # Vendors : uniquement leurs ventes (cohérence avec / et /sales-trend)
    query = db.query(Sale).join(User, Sale.vendor_id == User.id).filter(
        Sale.created_at >= cutoff,
        Sale.is_cancelled == False,
        User.role != UserRole.TECHNICIAN,
    )
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Sale.vendor_id == current_user.id)
    sales = query.all()
    
    # Initialize hours from 0h to 23h
    hourly_counts = {h: {"hour": f"{h}h", "sales_count": 0, "revenue": 0.0} for h in range(24)}
    
    for s in sales:
        h = s.created_at.hour
        hourly_counts[h]["sales_count"] += 1
        hourly_counts[h]["revenue"] += float(s.amount)
        
    return [hourly_counts[h] for h in range(24)]
