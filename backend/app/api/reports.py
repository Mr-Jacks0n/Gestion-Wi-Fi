"""Reports API — generate PDF and Excel reports."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.core.rate_limiting import limiter, RATE_LIMITS
from app.models.user import User, UserRole
from app.schemas.report import ReportRequest
from app.services.report_service import (
    get_sales_data, get_report_dates, generate_pdf_report, generate_excel_report,
)

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.post("/generate")
@limiter.limit(RATE_LIMITS["report"])
def generate_report(
    request: Request,
    data: ReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a sales report in PDF or Excel format."""
    # Determine date range
    if data.report_type == "custom":
        if not data.start_date or not data.end_date:
            raise HTTPException(status_code=400, detail="Dates de début et fin requises pour un rapport personnalisé")
        start_date = data.start_date
        end_date = data.end_date
    else:
        start_date, end_date = get_report_dates(data.report_type)

    # Vendors can only see their own data
    vendor_id = data.vendor_id
    if current_user.role == UserRole.VENDOR:
        vendor_id = current_user.id

    # Get data
    sales_data = get_sales_data(
        db, start_date, end_date, vendor_id,
        payment_method=data.payment_method,
        is_paid=data.is_paid
    )

    # Generate title
    type_labels = {
        "daily": "Rapport journalier",
        "weekly": "Rapport hebdomadaire",
        "monthly": "Rapport mensuel",
        "custom": "Rapport personnalisé",
    }
    title = f"{type_labels.get(data.report_type, 'Rapport')} — {start_date.strftime('%d/%m/%Y')} au {end_date.strftime('%d/%m/%Y')}"

    if data.format == "excel":
        buffer = generate_excel_report(sales_data, title)
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="rapport_{data.report_type}.xlsx"'},
        )
    else:
        buffer = generate_pdf_report(sales_data, title)
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="rapport_{data.report_type}.pdf"'},
        )


