"""Sales API — sell tickets, cancel sales, history."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin, get_current_admin_strict
from app.core.rate_limiting import limiter, RATE_LIMITS
from app.models.user import User, UserRole
from app.models.sale import Sale
from app.models.ticket import Ticket
from app.schemas.sale import SaleCreate, SaleResponse, SaleCancelRequest, ClientStatsResponse, SaleClientUpdate, ClientUpdate
from app.services.sale_service import create_sales, cancel_sale
from app.services.backup_service import trigger_background_backup
from app.services.webhook_service import trigger_webhook
from app.models.webhook import WebhookEventType

router = APIRouter(prefix="/api/sales", tags=["Sales"])



def format_sale_response(sale: Sale) -> SaleResponse:
    data = SaleResponse.model_validate(sale)
    data.ticket_code = (sale.ticket.code if sale.ticket else None) or sale.ticket_code or "N/A"
    data.vendor_name = sale.vendor.full_name if sale.vendor else "Inconnu"
    data.subscription_type_name = (
        (sale.ticket.subscription_type.name if sale.ticket and sale.ticket.subscription_type else None)
        or sale.subscription_type_name
        or "Non spécifié"
    )
    data.subscription_duration_hours = (
        (sale.ticket.subscription_type.duration_hours if sale.ticket and sale.ticket.subscription_type else None)
        or sale.subscription_duration_hours
    )
    data.batch_reference = (
        (sale.ticket.batch.reference if sale.ticket and sale.ticket.batch else None)
        or sale.batch_reference
    )
    data.ticket_status = sale.ticket.status.value if sale.ticket else None
    return data


@router.post("/", response_model=list[SaleResponse], status_code=201)
@limiter.limit(RATE_LIMITS["payment"])
def sell_tickets(
    request: Request,
    data: SaleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sell one or more tickets (vendor or admin)."""
    try:
        sales = create_sales(
            db=db,
            vendor_id=current_user.id,
            subscription_type_id=data.subscription_type_id,
            payment_method=data.payment_method,
            client_name=data.client_name,
            client_phone=data.client_phone,
            ticket_ids=data.ticket_ids,
            quantity=data.quantity,
            allow_compensation=(current_user.role == UserRole.ADMIN),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.utils.audit import log_action
    for sale in sales:
        log_action(
            db=db,
            user_id=current_user.id,
            action="sale.create",
            entity_type="sale",
            entity_id=sale.id,
            details={"ticket_code": sale.ticket_code or (sale.ticket.code if sale.ticket else "N/A"), "amount": float(sale.amount), "payment_method": sale.payment_method},
        )

    # Build response list
    result = [format_sale_response(sale) for sale in sales]

    # Trigger webhook for ticket sold
    for sale in sales:
        trigger_webhook(
            WebhookEventType.TICKET_SOLD,
            {
                "sale_id": sale.id,
                "ticket_code": sale.ticket.code if sale.ticket else (sale.ticket_code or "N/A"),
                "vendor_id": current_user.id,
                "vendor_name": current_user.full_name,
                "amount": float(sale.amount),
                "payment_method": sale.payment_method,
                "client_name": sale.client_name,
            },
            user_id=current_user.id
        )

    # Sauvegarde automatique en arrière-plan après chaque vente
    trigger_background_backup(trigger="vente")

    return result


@router.get("/", response_model=list[SaleResponse])
def list_sales(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    vendor_id: int | None = None,
    payment_method: str | None = None,
    client_phone: str | None = None,
    client_name: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List sales with filters."""
    query = db.query(Sale).join(User, Sale.vendor_id == User.id).filter(User.role != UserRole.TECHNICIAN)

    # Vendors see only their own sales
    if current_user.role == UserRole.VENDOR:
        query = query.filter(Sale.vendor_id == current_user.id)
    elif vendor_id:
        query = query.filter(Sale.vendor_id == vendor_id)

    if payment_method:
        query = query.filter(Sale.payment_method == payment_method)

    if client_phone:
        query = query.filter(Sale.client_phone == client_phone)
    
    if client_name:
        query = query.filter(Sale.client_name == client_name)

    sales = query.order_by(Sale.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return [format_sale_response(sale) for sale in sales]


@router.get("/today-summary")
def today_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get today's sales summary."""
    from datetime import date, datetime, timezone

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)

    query = db.query(Sale).join(User, Sale.vendor_id == User.id).filter(
        Sale.created_at >= today_start,
        Sale.is_cancelled == False,
        User.role != UserRole.TECHNICIAN
    )

    if current_user.role == UserRole.VENDOR:
        query = query.filter(Sale.vendor_id == current_user.id)

    sales = query.all()

    return {
        "total_sales": len(sales),
        "total_revenue": sum(float(s.amount) for s in sales),
        "cash_total": sum(float(s.amount) for s in sales if s.payment_method == "cash"),
        "wave_total": sum(float(s.amount) for s in sales if s.payment_method != "cash"),
    }


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
@limiter.limit(RATE_LIMITS["payment"])
def cancel(
    request: Request,
    sale_id: int,
    data: SaleCancelRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Cancel a sale (admin only). Ticket returns to assigned status or defective status."""
    try:
        sale, new_ticket = cancel_sale(db, sale_id, current_user.id, data.reason, data.mark_defective)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action="sale.cancel",
        entity_type="sale",
        entity_id=sale.id,
        details={"ticket_code": sale.ticket_code or (sale.ticket.code if sale.ticket else "N/A"), "amount": float(sale.amount), "reason": data.reason},
    )
    
    # Trigger webhook for payment cancellation
    trigger_webhook(
        WebhookEventType.PAYMENT_FAILED,
        {
            "sale_id": sale.id,
            "ticket_code": sale.ticket_code or (sale.ticket.code if sale.ticket else "N/A"),
            "amount": float(sale.amount),
            "reason": data.reason,
        },
        user_id=current_user.id
    )
    
    response = format_sale_response(sale)
    if new_ticket:
        response.replacement_ticket_code = new_ticket.code
    return response


@router.post("/{sale_id}/mark-paid", response_model=SaleResponse)
def mark_paid(
    sale_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a credit sale as paid.

    Un vendeur ne peut marquer que ses propres ventes ; admin/technicien
    peuvent marquer n'importe quelle vente.
    """
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Vente introuvable")

    if current_user.role == UserRole.VENDOR and sale.vendor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez marquer que vos propres ventes comme payées",
        )

    try:
        from app.services.sale_service import mark_sale_as_paid
        mark_sale_as_paid(db, sale_id)

        # Audit log
        from app.utils.audit import log_action
        log_action(
            db=db,
            user_id=current_user.id,
            action="sale.mark_paid",
            entity_type="sale",
            entity_id=sale.id,
            details={"ticket_code": sale.ticket_code or (sale.ticket.code if sale.ticket else "N/A"), "amount": float(sale.amount)},
        )

        return format_sale_response(sale)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/clients", response_model=list[ClientStatsResponse])
def get_clients_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List clients and their detailed stats (spend, last purchase, favorited, inactivity)."""
    from collections import defaultdict
    from datetime import datetime, timezone
    
    # Query non-cancelled sales with either name or phone (excluding technicians)
    sales = (
        db.query(Sale)
        .join(User, Sale.vendor_id == User.id)
        .filter(
            Sale.is_cancelled == False,
            User.role != UserRole.TECHNICIAN,
            ((Sale.client_name != None) & (Sale.client_name != "")) |
            ((Sale.client_phone != None) & (Sale.client_phone != ""))
        )
        .all()
    )
    
    client_groups = defaultdict(list)
    for sale in sales:
        # Group strictly by phone if present, otherwise fall back to name
        key = sale.client_phone.strip() if (sale.client_phone and sale.client_phone.strip()) else f"name:{sale.client_name}"
        client_groups[key].append(sale)
        
    now = datetime.now(timezone.utc)
    results = []
    for key, c_sales in client_groups.items():
        tickets_bought = len(c_sales)
        total_spent = sum(float(s.amount) for s in c_sales)
        
        # Get most recent non-empty name
        sorted_sales = sorted(c_sales, key=lambda s: s.created_at, reverse=True)
        name = None
        for s in sorted_sales:
            if s.client_name and s.client_name.strip():
                name = s.client_name.strip()
                break
        if not name and sorted_sales:
            name = sorted_sales[0].client_name
            
        phone = sorted_sales[0].client_phone
        last_purchase = sorted_sales[0].created_at
        
        # Calculate inactivity
        days_inactive = (now - last_purchase).days
        if days_inactive < 0:
            days_inactive = 0
            
        # Favorite subscription type
        sub_counts = defaultdict(int)
        for s in c_sales:
            if s.ticket and s.ticket.subscription_type:
                sub_counts[s.ticket.subscription_type.name] += 1
        favorite_subscription = max(sub_counts, key=sub_counts.get) if sub_counts else None
        
        results.append(
            ClientStatsResponse(
                name=name,
                phone=phone,
                tickets_bought=tickets_bought,
                total_spent=total_spent,
                last_purchase=last_purchase,
                favorite_subscription=favorite_subscription,
                days_inactive=days_inactive
            )
        )
        
    results.sort(key=lambda x: x.tickets_bought, reverse=True)
    return results


@router.put("/clients/update")
def update_client_stats(
    data: ClientUpdate,
    current_user: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Modify client name/phone directly and propagate the update to all matching sales (admin only)."""
    query = db.query(Sale)
    if data.old_phone and data.old_phone.strip():
        query = query.filter(Sale.client_phone == data.old_phone.strip())
    elif data.old_name and data.old_name.strip():
        query = query.filter(
            Sale.client_name == data.old_name.strip(),
            (Sale.client_phone == None) | (Sale.client_phone == "")
        )
    else:
        raise HTTPException(status_code=400, detail="Identifiants client manquants")
        
    matching_sales = query.all()
    if not matching_sales:
        raise HTTPException(status_code=404, detail="Client introuvable")
        
    new_name = data.new_name.strip() if data.new_name else None
    new_phone = data.new_phone.strip() if data.new_phone else None
    
    # If updating phone number to one that already exists, auto-fill existing name if empty
    if new_phone and new_phone != data.old_phone:
        existing = (
            db.query(Sale)
            .filter(Sale.client_phone == new_phone, Sale.client_name != None, Sale.client_name != "")
            .first()
        )
        if existing and not new_name:
            new_name = existing.client_name
            
    # Apply update to all matching sales
    for sale in matching_sales:
        sale.client_name = new_name
        sale.client_phone = new_phone
        
    db.commit()
    
    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action="client.update",
        entity_type="client",
        entity_id=0,
        details={
            "old_name": data.old_name,
            "old_phone": data.old_phone,
            "new_name": new_name,
            "new_phone": new_phone,
            "updated_sales_count": len(matching_sales)
        }
    )
    
    return {"status": "success", "updated_count": len(matching_sales)}



@router.put("/{sale_id}/client", response_model=SaleResponse)
def update_sale_client_api(
    sale_id: int,
    data: SaleClientUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a sale's client information (admin only) and trigger deduplication."""
    try:
        from app.services.sale_service import update_sale_client, merge_existing_contacts
        sale = update_sale_client(db, sale_id, data.client_name, data.client_phone)
        merge_existing_contacts(db)
        
        # Log action in audit log
        from app.utils.audit import log_action
        log_action(
            db=db,
            user_id=current_user.id,
            action="sale.update_client",
            entity_type="sale",
            entity_id=sale.id,
            details={"client_name": data.client_name, "client_phone": data.client_phone},
        )
        
        return format_sale_response(sale)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

