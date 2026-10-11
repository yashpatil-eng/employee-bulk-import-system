
import csv
from io import BytesIO


from django.http import HttpResponse
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from openpyxl import Workbook
from decimal import Decimal, InvalidOperation
from .models import Employee


def get_filtered_employees(params, user):
    employees = Employee.objects.filter(
        owner=user
    ).order_by("name")

    search = params.get("search", "").strip()
    department = params.get("department", "").strip()
    min_salary = params.get("min_salary", "").strip()
    max_salary = params.get("max_salary", "").strip()

    if search:
        employees = employees.filter(
            Q(name__icontains=search) |
            Q(email__icontains=search)
        )

    if department:
        employees = employees.filter(department__iexact=department)

    try:
        minimum = Decimal(min_salary) if min_salary else None
        maximum = Decimal(max_salary) if max_salary else None
    except InvalidOperation:
        raise ValueError("Salary filters must be valid numbers.")

    for value in (minimum, maximum):
        if value is not None and (
            not value.is_finite() or value < 0
        ):
            raise ValueError(
                "Salary filters must be finite, non-negative numbers."
            )

    if minimum is not None and maximum is not None and minimum > maximum:
        raise ValueError(
            "Minimum salary cannot exceed maximum salary."
        )

    if minimum is not None:
        employees = employees.filter(salary__gte=minimum)

    if maximum is not None:
        employees = employees.filter(salary__lte=maximum)

    return employees


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_employees(request):
    file_format = request.query_params.get("format", "csv").lower()
    
    if file_format not in ["csv", "xlsx"]:
        return Response(
            {"error": "Format must be csv or xlsx."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        employees = get_filtered_employees(
            request.query_params,
            request.user,
)
    except ValueError as error:
        return Response(
            {"error": str(error)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    headers = [
        "Employee ID",
        "Name",
        "Email",
        "Department",
        "Salary",
        "Created At",
    ]

    if file_format == "csv":
        response = HttpResponse(
            content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = (
            'attachment; filename="employees.csv"'
        )

        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(headers)

        for employee in employees.iterator():
            writer.writerow([
                str(employee.id),
                employee.name,
                employee.email,
                employee.department or "",
                employee.salary if employee.salary is not None else "",
                employee.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            ])

        return response

    # Generate an Excel workbook.
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Employees"
    worksheet.append(headers)

    for employee in employees.iterator():
        worksheet.append([
            str(employee.id),
            employee.name,
            employee.email,
            employee.department or "",
            float(employee.salary) if employee.salary is not None else None,
            employee.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        ])

    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions

    for column in worksheet.columns:
        max_length = max(
            len(str(cell.value or ""))
            for cell in column
        )
        worksheet.column_dimensions[
            column[0].column_letter
        ].width = min(max_length + 2, 35)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)

    response = HttpResponse(
        output.getvalue(),
        content_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
    )
    response["Content-Disposition"] = (
        'attachment; filename="employees.xlsx"'
    )

    return response
