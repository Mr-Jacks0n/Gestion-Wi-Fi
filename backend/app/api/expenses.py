from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_admin_strict
from app.models.user import User
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseResponse
from app.utils.audit import log_action

router = APIRouter(prefix="/api/expenses", tags=["Expenses"])

@router.get("/", response_model=list[ExpenseResponse])
def list_expenses(
    current_admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db)
):
    """List all expenses (admin only — données financières)."""
    expenses = db.query(Expense).order_by(Expense.created_at.desc()).all()
    result = []
    for exp in expenses:
        resp = ExpenseResponse.model_validate(exp)
        resp.created_by_name = exp.created_by.full_name if exp.created_by else "Inconnu"
        result.append(resp)
    return result

@router.post("/", response_model=ExpenseResponse)
def create_expense(
    data: ExpenseCreate,
    current_admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db)
):
    """Create a new expense (admin only)."""
    expense = Expense(
        description=data.description,
        amount=data.amount,
        category=data.category,
        payment_source=data.payment_source,
        created_by_id=current_admin.id
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    # Log action
    log_action(
        db=db,
        user_id=current_admin.id,
        action="expense.create",
        entity_type="expense",
        entity_id=expense.id,
        details={"description": expense.description, "amount": float(expense.amount), "category": expense.category, "payment_source": expense.payment_source}
    )

    resp = ExpenseResponse.model_validate(expense)
    resp.created_by_name = current_admin.full_name
    return resp

@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    current_admin: User = Depends(get_current_admin_strict),
    db: Session = Depends(get_db)
):
    """Delete an expense (admin only)."""
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Dépense introuvable")

    # Log action
    log_action(
        db=db,
        user_id=current_admin.id,
        action="expense.delete",
        entity_type="expense",
        entity_id=expense.id,
        details={"description": expense.description, "amount": float(expense.amount), "category": expense.category}
    )

    db.delete(expense)
    db.commit()
    return
