
import csv
import io
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from django.urls import reverse

from openpyxl import Workbook

from rest_framework import status
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from .models import Employee
from .export_views import export_employees


class EmployeeExportFormatTests(SimpleTestCase):
    def test_csv_and_xlsx_export_query_parameter(self):
        factory = APIRequestFactory()
        employees = Mock()
        employees.iterator.return_value = []

        with patch(
            "api.export_views.get_filtered_employees",
            return_value=employees,
        ):
            for file_format in ("csv", "xlsx"):
                with self.subTest(file_format=file_format):
                    request = factory.get(
                        f"/employees/export/?format={file_format}"
                    )
                    force_authenticate(
                        request,
                        user=SimpleNamespace(is_authenticated=True),
                    )

                    response = export_employees(request)

                    self.assertEqual(response.status_code, status.HTTP_200_OK)
                    self.assertIn(
                        f"employees.{file_format}",
                        response["Content-Disposition"],
                    )


class EmployeeImportTests(APITestCase):


    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="testuser",
            password="Test-password-123",
        )
        self.client.force_authenticate(user=self.user)

        self.import_url = "/employees/import/"
        self.report_url = "/employees/failed-report/"

    def upload_csv(self, content, filename="employees.csv"):
        file = SimpleUploadedFile(
            filename,
            content.encode("utf-8"),
            content_type="text/csv",
        )
        return self.client.post(
            self.import_url,
            {"file": file},
            format="multipart",
        )

    def upload_xlsx(self, rows):
        output = io.BytesIO()
        workbook = Workbook()
        sheet = workbook.active

        for row in rows:
            sheet.append(row)

        workbook.save(output)
        workbook.close()

        file = SimpleUploadedFile(
            "employees.xlsx",
            output.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),
        )
        return self.client.post(
            self.import_url,
            {"file": file},
            format="multipart",
        )

    def test_valid_csv_import(self):
        response = self.upload_csv(
            "name,email,department,salary\n"
            "Amit,amit@example.com,IT,50000\n"
            "Priya,priya@example.com,HR,45000\n"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_rows"], 2)
        self.assertEqual(response.data["imported_rows"], 2)
        self.assertEqual(response.data["failed_rows"], 0)
        self.assertEqual(Employee.objects.count(), 2)

    def test_valid_xlsx_import(self):
        response = self.upload_xlsx([
            ["name", "email", "department", "salary"],
            ["Amit", "amit@example.com", "IT", 50000],
        ])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported_rows"], 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_invalid_email_is_rejected(self):
        response = self.upload_csv(
            "name,email,department,salary\n"
            "Amit,invalid-email,IT,50000\n"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported_rows"], 0)
        self.assertEqual(response.data["failed_rows"], 1)
        self.assertIn(
            "Email format is invalid.",
            response.data["failed_records"][0]["errors"],
        )
        self.assertEqual(Employee.objects.count(), 0)

    def test_negative_salary_is_rejected(self):
        response = self.upload_csv(
            "name,email,department,salary\n"
            "Amit,amit@example.com,IT,-100\n"
        )

        self.assertEqual(response.data["imported_rows"], 0)
        self.assertEqual(response.data["failed_rows"], 1)
        self.assertIn(
            "Salary must be a non-negative number.",
            response.data["failed_records"][0]["errors"],
        )

    def test_duplicate_email_within_file(self):
        response = self.upload_csv(
            "name,email,department,salary\n"
            "Amit,amit@example.com,IT,50000\n"
            "Amit Duplicate,amit@example.com,HR,40000\n"
        )

        self.assertEqual(response.data["imported_rows"], 1)
        self.assertEqual(response.data["failed_rows"], 1)
        self.assertIn(
            "Duplicate email in uploaded file.",
            response.data["failed_records"][0]["errors"],
        )
        self.assertEqual(Employee.objects.count(), 1)

    def test_existing_database_email_is_rejected(self):
        Employee.objects.create(
            name="Existing Employee",
            email="amit@example.com",
            department="IT",
            salary=50000,
        )

        response = self.upload_csv(
            "name,email,department,salary\n"
            "Amit,amit@example.com,HR,40000\n"
        )

        self.assertEqual(response.data["imported_rows"], 0)
        self.assertEqual(response.data["failed_rows"], 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_uploading_same_file_twice_does_not_duplicate(self):
        content = (
            "name,email,department,salary\n"
            "Amit,amit@example.com,IT,50000\n"
        )

        first_response = self.upload_csv(content)
        second_response = self.upload_csv(content)

        self.assertEqual(first_response.data["imported_rows"], 1)
        self.assertEqual(second_response.data["imported_rows"], 0)
        self.assertEqual(second_response.data["failed_rows"], 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_missing_file_is_rejected(self):
        response = self.client.post(self.import_url, {}, format="multipart")

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("error", response.data)

    def test_missing_required_headers_are_rejected(self):
        response = self.upload_csv(
            "name,department,salary\n"
            "Amit,IT,50000\n"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("Missing required columns", response.data["error"])

    def test_failed_report_download(self):
        response = self.client.post(
            self.report_url,
            {
                "failed_records": [{
                    "row": 2,
                    "name": "Amit",
                    "email": "invalid-email",
                    "department": "IT",
                    "salary": "50000",
                    "errors": ["Email format is invalid."],
                }]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn(
            b"Email format is invalid.",
            response.content,
        )
