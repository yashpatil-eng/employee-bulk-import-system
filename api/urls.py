from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views, frontend_views
from .employee_views import list_employees, employee_detail
from .export_views import export_employees


urlpatterns = [
    # Frontend pages
    path("", frontend_views.employee_dashboard, name="dashboard"),
    path("login/", frontend_views.login_page, name="login"),
    path("register/", frontend_views.register_page, name="register-page"),

    # Registration API
    path("users/register/", views.register_user, name="register"),
    path("users/token/", TokenObtainPairView.as_view(),name="token_obtain_pair",),

    # JWT authentication
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Import and failed-record report
    path("employees/import/", views.import_employees, name="import-employees"),
    path(
        "employees/failed-report/",
        views.download_failed_report,
        name="download-failed-report",
    ),

    # Employee listing, filtering, and pagination
    path("employees/", list_employees, name="list-employees"),
    path(
        "employees/paginated/",
        list_employees,
        name="paginated-employees",
    ),

    # Export
    path(
    "employees/export/",
    export_employees,
    name="export-employees",
),

    # Individual employee operations — keep this after specific employee routes
    path(
        "employees/<uuid:employee_id>/",
        employee_detail,
        name="employee-detail",
    ),
]
