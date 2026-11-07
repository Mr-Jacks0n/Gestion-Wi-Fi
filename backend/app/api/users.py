"""Users API — CRUD for vendors and admin user management."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin, get_current_admin_strict
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.sale import Sale
from app.models.ticket import Ticket, TicketStatus
from app.models.resupply import ResupplyRequest
from app.models.notification import Notification
from app.models.expense import Expense
from app.models.batch import Batch
from app.models.audit_log import AuditLog
from app.utils.audit import log_action

from app.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserWithStats, AdminPasswordChange,
)

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/", response_model=list[UserWithStats])
def list_users(
    role: str | None = None,
    is_active: bool | None = None,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """List all users with optional filters (admin only)."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    users = query.order_by(User.created_at.desc()).all()

    result = []
    for user in users:
        # Get stats
        total_sales = db.query(func.count(Sale.id)).filter(
            Sale.vendor_id == user.id, Sale.is_cancelled == False
        ).scalar() or 0
        total_revenue = db.query(func.sum(Sale.amount)).filter(
            Sale.vendor_id == user.id, Sale.is_cancelled == False
        ).scalar() or 0
        stock_count = db.query(func.count(Ticket.id)).filter(
            Ticket.assigned_to == user.id, Ticket.status == TicketStatus.ASSIGNED
        ).scalar() or 0

        user_data = UserWithStats.model_validate(user)
        user_data.total_sales = total_sales
        user_data.total_revenue = float(total_revenue)
        user_data.stock_count = stock_count
        result.append(user_data)

    return result


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Create a new user (admin only)."""
    # Check uniqueness
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur existe déjà")
    if db.query(User).filter(User.phone == data.phone).first():
        raise HTTPException(status_code=400, detail="Ce numéro de téléphone existe déjà")

    user = User(
        username=data.username,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole(data.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserWithStats)
def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Get a specific user with stats (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    total_sales = db.query(func.count(Sale.id)).filter(
        Sale.vendor_id == user.id, Sale.is_cancelled == False
    ).scalar() or 0
    total_revenue = db.query(func.sum(Sale.amount)).filter(
        Sale.vendor_id == user.id, Sale.is_cancelled == False
    ).scalar() or 0
    stock_count = db.query(func.count(Ticket.id)).filter(
        Ticket.assigned_to == user.id, Ticket.status == TicketStatus.ASSIGNED
    ).scalar() or 0

    user_data = UserWithStats.model_validate(user)
    user_data.total_sales = total_sales
    user_data.total_revenue = float(total_revenue)
    user_data.stock_count = stock_count
    return user_data


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        existing = db.query(User).filter(User.phone == data.phone, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ce numéro de téléphone existe déjà")
        user.phone = data.phone
    if data.email is not None:
        user.email = data.email
    if data.is_active is not None:
        user.is_active = data.is_active

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Delete a user completely and transfer their tickets and other data to the administrator (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    username = user.username

    # 1. Reassign tickets assigned to this user to the admin
    db.query(Ticket).filter(Ticket.assigned_to == user.id).update(
        {Ticket.assigned_to: admin.id}, synchronize_session=False
    )

    # 2. Reassign sales (both vendor and canceller) to the admin
    db.query(Sale).filter(Sale.vendor_id == user.id).update(
        {Sale.vendor_id: admin.id}, synchronize_session=False
    )
    db.query(Sale).filter(Sale.cancelled_by == user.id).update(
        {Sale.cancelled_by: admin.id}, synchronize_session=False
    )

    # 3. Reassign resupply requests (vendor and processor) to the admin
    db.query(ResupplyRequest).filter(ResupplyRequest.vendor_id == user.id).update(
        {ResupplyRequest.vendor_id: admin.id}, synchronize_session=False
    )
    db.query(ResupplyRequest).filter(ResupplyRequest.processed_by == user.id).update(
        {ResupplyRequest.processed_by: admin.id}, synchronize_session=False
    )

    # 4. Reassign expenses created by the user to the admin
    db.query(Expense).filter(Expense.created_by_id == user.id).update(
        {Expense.created_by_id: admin.id}, synchronize_session=False
    )

    # 5. Reassign batches created by the user to the admin
    db.query(Batch).filter(Batch.admin_id == user.id).update(
        {Batch.admin_id: admin.id}, synchronize_session=False
    )

    # 6. Reassign audit logs created by the user to the admin
    db.query(AuditLog).filter(AuditLog.user_id == user.id).update(
        {AuditLog.user_id: admin.id}, synchronize_session=False
    )

    # 7. Delete notifications associated with the user
    db.query(Notification).filter(Notification.user_id == user.id).delete(
        synchronize_session=False
    )

    # 8. Delete the user completely
    db.delete(user)
    db.commit()

    # 9. Audit the deletion action
    log_action(
        db=db,
        user_id=admin.id,
        action="user.delete_complete",
        entity_type="user",
        entity_id=user_id,
        details={"username": username, "transferred_to_admin_id": admin.id},
    )

    return {"message": f"Utilisateur {username} supprimé définitivement et ses données transférées à l'administrateur"}


@router.post("/{user_id}/change-password")
def admin_change_password(
    user_id: int,
    data: AdminPasswordChange,
    admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db),
):
    """Admin changes any user's password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user.password_hash = hash_password(data.new_password)
    db.commit()

    # Traçabilité : action sensible (réinitialisation)
    log_action(
        db=db,
        user_id=admin.id,
        action="user.admin_change_password",
        entity_type="user",
        entity_id=user.id,
        details={"username": user.username, "changed_by": admin.username},
    )
    return {"message": f"Mot de passe de {user.username} modifié avec succès"}
