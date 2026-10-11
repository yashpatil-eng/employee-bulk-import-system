
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .models import Employee
from .serializers import EmployeeSerializer
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated


class EmployeePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


# GET: List, search, filter, and paginate employees.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_employees(request):
    employees = Employee.objects.filter(
        owner=request.user
    ).order_by("-created_at")

    # Search by name or email.
    search = request.query_params.get("search", "").strip()

    if search:
        employees = employees.filter(
            Q(name__icontains=search)
            | Q(email__icontains=search)
        )

    # Filter by department.
    department = request.query_params.get("department", "").strip()

    if department:
        employees = employees.filter(
            department__iexact=department
        )

    # Filter by minimum salary.
    min_salary = request.query_params.get("min_salary")

    if min_salary not in (None, ""):
        try:
            min_salary = Decimal(min_salary)

            if not min_salary.is_finite() or min_salary < 0:
                raise InvalidOperation

            employees = employees.filter(salary__gte=min_salary)

        except (InvalidOperation, ValueError):
            return Response(
                {"error": "Minimum salary must be a valid non-negative number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Filter by maximum salary.
    max_salary = request.query_params.get("max_salary")

    if max_salary not in (None, ""):
        try:
            max_salary = Decimal(max_salary)

            if not max_salary.is_finite() or max_salary < 0:
                raise InvalidOperation

            employees = employees.filter(salary__lte=max_salary)

        except (InvalidOperation, ValueError):
            return Response(
                {"error": "Maximum salary must be a valid non-negative number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Check that the salary range is logical.
    if (
        min_salary not in (None, "")
        and max_salary not in (None, "")
        and min_salary > max_salary
    ):
        return Response(
            {"error": "Minimum salary cannot exceed maximum salary."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Return paginated JSON.
    paginator = EmployeePagination()
    page = paginator.paginate_queryset(employees, request)

    serializer = EmployeeSerializer(page, many=True)

    return paginator.get_paginated_response(serializer.data)


# GET: Retrieve one employee.
# PUT/PATCH: Update an employee.
# DELETE: Delete an employee.
@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def employee_detail(request, employee_id):
    employee = get_object_or_404(
        Employee,
        id=employee_id,
        owner=request.user,
    )

    if request.method == "GET":
        serializer = EmployeeSerializer(employee)
        return Response(serializer.data)

    if request.method in ["PUT", "PATCH"]:
        serializer = EmployeeSerializer(
            employee,
            data=request.data,
            partial=(request.method == "PATCH"),
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "DELETE":
        employee.delete()

        return Response(
            {"message": "Employee deleted successfully."},
            status=status.HTTP_200_OK,
        )
