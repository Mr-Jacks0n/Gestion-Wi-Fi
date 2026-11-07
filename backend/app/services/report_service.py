"""
Report service — generates PDF and Excel reports.
Rebuilt completely from scratch.
"""

from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.sale import Sale
from app.models.ticket import Ticket
from app.models.user import User


def get_sales_data(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    vendor_id: int | None = None,
    payment_method: str | None = None,
    is_paid: bool | None = None,
) -> list[dict]:
    """
    Retrieve formatted sales data for report generation.
    Handles date bounds and Joins properly.
    """
    from app.models.user import UserRole
    query = (
        db.query(Sale, Ticket, User)
        .join(Ticket, Sale.ticket_id == Ticket.id)
        .join(User, Sale.vendor_id == User.id)
        .filter(User.role != UserRole.TECHNICIAN)
    )

    if start_date:
        start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        query = query.filter(Sale.created_at >= start_dt)
        
    if end_date:
        end_dt = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)
        query = query.filter(Sale.created_at <= end_dt)

    if vendor_id:
        query = query.filter(Sale.vendor_id == vendor_id)

    if payment_method:
        query = query.filter(Sale.payment_method == payment_method)

    if is_paid is not None:
        query = query.filter(Sale.is_paid == is_paid)

    results = query.order_by(Sale.created_at.desc()).all()

    return [
        {
            "id": sale.id,
            "date": sale.created_at.strftime("%d/%m/%Y %H:%M"),
            "ticket_code": ticket.code,
            "vendor": user.full_name,
            "client_name": sale.client_name or "-",
            "client_phone": sale.client_phone or "-",
            "payment_method": sale.payment_method.upper(),
            "amount": float(sale.amount),
            "cancelled": "Oui" if sale.is_cancelled else "Non",
        }
        for sale, ticket, user in results
    ]


def get_report_dates(report_type: str) -> tuple[date, date]:
    """
    Calculate the start and end dates based on the report type.
    """
    today = date.today()
    if report_type == "daily":
        return today, today
    elif report_type == "weekly":
        start = today - timedelta(days=today.weekday())
        return start, today
    elif report_type == "monthly":
        start = today.replace(day=1)
        return start, today
    else:
        return today, today


def generate_pdf_report(sales_data: list[dict], title: str) -> BytesIO:
    """
    Generate a clean landscape A4 PDF report of sales.
    """
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    buffer = BytesIO()
    # Landscape orientation yields more horizontal space for detailed tables
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom colors
    navy_dark = colors.HexColor("#1e3a5f")
    gray_light = colors.HexColor("#f8fafc")
    gray_border = colors.HexColor("#cbd5e1")
    
    # Custom styles
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=navy_dark,
        alignment=0, # Left-aligned
        spaceAfter=15
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8
    )

    elements = []

    # Title
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 10))

    # Financial Synthesis Calculations
    valid_sales = [s for s in sales_data if s["cancelled"] == "Non"]
    total_sales = len(valid_sales)
    total_revenue = sum(s["amount"] for s in valid_sales)
    
    cash_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "CASH")
    wave_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "WAVE")
    credit_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "CREDIT")
    comp_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "COMPENSATION")

    # Financial Summary Table
    summary_headers = ["Total Ventes", "Chiffre d'Affaires", "Espèces (CASH)", "Wave", "Crédits (En Attente)", "Dédommagements"]
    summary_values = [
        str(total_sales),
        f"{total_revenue:,.0f} FCFA",
        f"{cash_total:,.0f} FCFA",
        f"{wave_total:,.0f} FCFA",
        f"{credit_total:,.0f} FCFA",
        f"{comp_total:,.0f} FCFA",
    ]
    
    summary_table = Table([summary_headers, summary_values], colWidths=[90, 130, 130, 130, 130, 130])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy_dark),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, gray_border),
        ("BACKGROUND", (0, 1), (-1, 1), gray_light),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    
    elements.append(Paragraph("Synthèse Financière :", section_style))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))

    # Main Sales Detailed Table
    elements.append(Paragraph("Détail des Ventes :", section_style))
    
    if sales_data:
        headers = ["N° Vente", "Date & Heure", "Code Ticket", "Vendeur", "Nom Client", "Téléphone", "Règlement", "Montant", "Annulé"]
        table_data = [headers]
        
        for s in sales_data:
            table_data.append([
                str(s["id"]),
                s["date"],
                s["ticket_code"],
                s["vendor"],
                s["client_name"],
                s["client_phone"],
                s["payment_method"],
                f"{s['amount']:,.0f} FCFA",
                s["cancelled"]
            ])

        # Printable width landscape A4 is 770pt. We allocate widths precisely to avoid overflow.
        col_widths = [55, 100, 85, 100, 100, 85, 80, 85, 60]
        sales_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        sales_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, gray_border),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, gray_light]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(sales_table)
    else:
        no_data_style = ParagraphStyle('NoData', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=10, textColor=colors.HexColor("#64748b"))
        elements.append(Paragraph("Aucune vente enregistrée sur cette période.", no_data_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_excel_report(sales_data: list[dict], title: str) -> BytesIO:
    """
    Generate a clean Excel report of sales with proper cell formats.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Synthèse et Ventes"

    # Layout Styles
    font_title = Font(name="Calibri", size=15, bold=True, color="1e3a5f")
    font_section = Font(name="Calibri", size=11, bold=True, color="0f172a")
    font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_data = Font(name="Calibri", size=10)
    font_summary_header = Font(name="Calibri", size=9, bold=True, color="0f172a")
    
    fill_header = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    fill_summary_hdr = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    
    border_thin = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1")
    )
    
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # 1. Main Title
    ws.merge_cells("A1:I1")
    ws["A1"].value = title
    ws["A1"].font = font_title
    ws["A1"].alignment = align_center
    ws.row_dimensions[1].height = 35

    # Financial Summary Calculations
    valid_sales = [s for s in sales_data if s["cancelled"] == "Non"]
    total_sales = len(valid_sales)
    total_revenue = sum(s["amount"] for s in valid_sales)
    
    cash_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "CASH")
    wave_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "WAVE")
    credit_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "CREDIT")
    comp_total = sum(s["amount"] for s in valid_sales if s["payment_method"] == "COMPENSATION")

    # 2. Financial Synthesis Section (Rows 3-5)
    ws.cell(row=3, column=1, value="Synthèse Financière").font = font_section
    ws.row_dimensions[3].height = 20

    summary_headers = [
        "Ventes Validées", 
        "Chiffre d'Affaires (FCFA)", 
        "Espèces (CASH) (FCFA)", 
        "Wave (FCFA)", 
        "Crédits (FCFA)", 
        "Dédommagements (FCFA)"
    ]
    summary_vals = [total_sales, total_revenue, cash_total, wave_total, credit_total, comp_total]

    for col_idx, text in enumerate(summary_headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=text)
        cell.font = font_summary_header
        cell.fill = fill_summary_hdr
        cell.border = border_thin
        cell.alignment = align_center
    ws.row_dimensions[4].height = 22

    for col_idx, val in enumerate(summary_vals, 1):
        cell = ws.cell(row=5, column=col_idx, value=val)
        cell.font = font_data
        cell.border = border_thin
        cell.alignment = align_center
        # Set proper currency format for currency columns
        if col_idx > 1:
            cell.number_format = "#,##0"
    ws.row_dimensions[5].height = 22

    # 3. Detailed Sales Table (Starting Row 7)
    ws.cell(row=7, column=1, value="Détail des Ventes").font = font_section
    ws.row_dimensions[7].height = 20

    headers = ["N° Vente", "Date & Heure", "Code Ticket", "Vendeur", "Nom Client", "Téléphone", "Règlement", "Montant (FCFA)", "Annulé"]
    for col_idx, text in enumerate(headers, 1):
        cell = ws.cell(row=8, column=col_idx, value=text)
        cell.font = font_header
        cell.fill = fill_header
        cell.border = border_thin
        cell.alignment = align_center
    ws.row_dimensions[8].height = 25

    # Populate Data (Starting Row 9)
    current_row = 9
    for s in sales_data:
        row_values = [
            s["id"],
            s["date"],
            s["ticket_code"],
            s["vendor"],
            s["client_name"],
            s["client_phone"],
            s["payment_method"],
            s["amount"],
            s["cancelled"]
        ]
        
        for col_idx, val in enumerate(row_values, 1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = font_data
            cell.border = border_thin
            
            # Alignments & formats
            if col_idx in [1, 2, 3, 7, 9]:
                cell.alignment = align_center
            elif col_idx in [4, 5]:
                cell.alignment = align_left
            elif col_idx == 8:
                cell.alignment = align_right
                cell.number_format = "#,##0"
                
        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        
        # Don't size columns based on the merged title cell A1
        for cell in col:
            if cell.row == 1:
                continue
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
                
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 12), 30)

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
