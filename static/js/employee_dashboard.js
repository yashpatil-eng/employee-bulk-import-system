"use strict";

function getAccessToken() {
    return sessionStorage.getItem("accessToken");
}

function getAuthHeaders(extraHeaders = {}) {
    const token = getAccessToken();

    return {
        ...extraHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

document.addEventListener("DOMContentLoaded", () => {
    // Require a token before initializing the dashboard.
    if (!getAccessToken()) {
        window.location.replace("/login/");
        return;
    }
    // API endpoints
    const API = {
        import: "/employees/import/",
        employees: "/employees/paginated/",
        failedReport: "/employees/failed-report/"
    };

    // Upload elements
    const uploadForm = document.getElementById("uploadForm");
    const employeeFile = document.getElementById("employeeFile");
    const selectedFileName = document.getElementById("selectedFileName");
    const uploadButton = document.getElementById("uploadButton");
    const uploadStatus = document.getElementById("uploadStatus");
    const uploadError = document.getElementById("uploadError");
    const uploadArea = document.getElementById("uploadArea");

    // Import summary elements
    const importResults = document.getElementById("importResults");
    const totalRows = document.getElementById("totalRows");
    const importedRows = document.getElementById("importedRows");
    const failedRows = document.getElementById("failedRows");
    const resultFilename = document.getElementById("resultFilename");
    const importMessage = document.getElementById("importMessage");
    const importResultsBody = document.getElementById("importResultsBody");
    const closeResults = document.getElementById("closeResults");
    const downloadFailedButton = document.getElementById(
        "downloadFailedButton"
    );

    // Employee directory elements
    const filterForm = document.getElementById("filterForm");
    const searchInput = document.getElementById("searchInput");
    const departmentInput = document.getElementById("departmentInput");
    const minSalaryInput = document.getElementById("minSalaryInput");
    const maxSalaryInput = document.getElementById("maxSalaryInput");
    const pageSizeInput = document.getElementById("pageSizeInput");
    const clearFiltersButton = document.getElementById("clearFiltersButton");
    
    const refreshButton = document.getElementById("refreshButton");

    // Export employees
    async function exportEmployees(format) {
        const params = new URLSearchParams({
            format,
            search: searchInput.value.trim(),
            department: departmentInput.value.trim(),
            min_salary: minSalaryInput.value,
            max_salary: maxSalaryInput.value
        });

        try {
            const response = await fetch(
                `/employees/export/?${params}`,
                { headers: getAuthHeaders() }
            );

            if (!response.ok) {
                throw new Error(`Export failed (${response.status}).`);
            }

            const link = document.createElement("a");
            link.href = URL.createObjectURL(await response.blob());
            link.download = `employees.${format}`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            showError(employeeError, error.message);
        }
    }

    document.getElementById("exportCsvButton").onclick =
        () => exportEmployees("csv");

    document.getElementById("exportExcelButton").onclick =
        () => exportEmployees("xlsx");

    const employeeError = document.getElementById("employeeError");
    const employeeTableBody = document.getElementById("employeeTableBody");
    const employeeCount = document.getElementById("employeeCount");
    const paginationInfo = document.getElementById("paginationInfo");
    const previousPageButton = document.getElementById(
        "previousPageButton"
    );
    const nextPageButton = document.getElementById("nextPageButton");

    let failedRecords = [];
    let nextPageUrl = null;
    let previousPageUrl = null;
    let currentPage = 1;
    let totalEmployees = 0;

    // Read the CSRF token rendered by Django.
    function getCsrfToken() {
        const tokenInput = document.querySelector(
            'input[name="csrfmiddlewaretoken"]'
        );

        return tokenInput ? tokenInput.value : "";
    }

    // Generic JSON request helper.

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: getAuthHeaders(options.headers || {})
        });

        const contentType = response.headers.get("content-type") || "";
        let data = {};

        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { detail: text };
        }

        if (response.status === 401) {
            sessionStorage.removeItem("accessToken");
            sessionStorage.removeItem("refreshToken");
            window.location.assign("/login/");
            throw new Error("Your session has expired. Please sign in again.");
        }

        if (!response.ok) {
            throw new Error(
                data.detail ||
                data.error ||
                data.message ||
                `Request failed with status ${response.status}.`
            );
        }

        return data;
    }

    // Safely create text-only table cells.
    function createCell(value, className = "") {
        const cell = document.createElement("td");
        cell.textContent = value == null || value === "" ? "—" : String(value);
        if (className) cell.className = className;
        return cell;
    }

    function showError(element, message) {
        element.textContent = message;
        element.classList.remove("hidden");
    }

    function hideError(element) {
        element.textContent = "";
        element.classList.add("hidden");
    }

    function showEmptyRow(tbody, colspan, message) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = colspan;
        cell.className = "empty-state";
        cell.textContent = message;

        row.appendChild(cell);
        tbody.replaceChildren(row);
    }

    function formatSalary(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return String(value);
        }

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(amount);
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function isSupportedFile(file) {
    return ["csv", "xlsx"].includes(
        file.name.split(".").pop().toLowerCase()
    );
}

    // ------------------------------
    // File selection
    // ------------------------------

    employeeFile.addEventListener("change", () => {
        const file = employeeFile.files[0];

        selectedFileName.textContent = file
            ? file.name
            : "No file selected";

        hideError(uploadError);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        uploadArea.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadArea.classList.add("drag-active");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        uploadArea.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadArea.classList.remove("drag-active");
        });
    });

    uploadArea.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;

        if (!files || !files.length) {
            return;
        }

        const file = files[0];
        const extension = file.name.split(".").pop().toLowerCase();

       if (!isSupportedFile(file)) {
            showError(uploadError, "Unsupported file format. Choose CSV or XLSX.");
            return;
        }

        const transfer = new DataTransfer();
        transfer.items.add(file);
        employeeFile.files = transfer.files;

        selectedFileName.textContent = file.name;
        hideError(uploadError);
    });

    // ------------------------------
    // Import employees
    // ------------------------------

    uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        hideError(uploadError);

        const file = employeeFile.files[0];

        if (!file) {
            showError(uploadError, "Please select a file first.");
            return;
        }

        const extension = file.name.split(".").pop().toLowerCase();

        if (!["csv", "xlsx"].includes(extension)) {
            showError(
                uploadError,
                "Unsupported file format. Choose CSV or XLSX."
            );
            return;
        }

        const formData = new FormData(uploadForm);

        uploadButton.disabled = true;
        uploadButton.textContent = "Importing...";
        uploadStatus.textContent = "Please wait while your file is processed.";

        try {
            const data = await requestJson(API.import, {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCsrfToken()
                },
                body: formData
            });

            displayImportResults(data);

            uploadStatus.textContent = "Import processing completed.";

            // Refresh the employee directory after the import.
            await loadEmployees();
        } catch (error) {
            showError(uploadError, error.message);
            uploadStatus.textContent = "Import failed.";
        } finally {
            uploadButton.disabled = false;
            uploadButton.textContent = "Upload and import";
        }
    });

    // ------------------------------
    // Display import summary
    // ------------------------------

    function displayImportResults(data) {
        importResults.classList.remove("hidden");

        totalRows.textContent = data.total_rows ?? 0;
        importedRows.textContent = data.imported_rows ?? 0;
        failedRows.textContent = data.failed_rows ?? 0;

        resultFilename.textContent = data.filename
            ? `File: ${data.filename}`
            : "Import results";

        importMessage.textContent =
            data.message || "File processing completed.";

        failedRecords = Array.isArray(data.failed_records)
            ? data.failed_records
            : [];

        const records = Array.isArray(data.employees)
            ? data.employees
            : [];

        importResultsBody.replaceChildren();

        if (records.length === 0) {
            showEmptyRow(
                importResultsBody,
                7,
                "No row-level results were returned."
            );
        } else {
            records.forEach((record) => {
                const row = document.createElement("tr");

                row.appendChild(createCell(record.row));
                row.appendChild(createCell(record.name));
                row.appendChild(createCell(record.email));
                row.appendChild(createCell(record.department));
                row.appendChild(createCell(formatSalary(record.salary)));

                const statusCell = document.createElement("td");
                const badge = document.createElement("span");

                badge.className = "status-badge";

                if (record.imported === true) {
                    badge.classList.add("success");
                    badge.textContent = "Imported";
                } else {
                    badge.classList.add("failed");
                    badge.textContent = "Failed";
                }

                statusCell.appendChild(badge);
                row.appendChild(statusCell);

                const errors = Array.isArray(record.errors)
                    ? record.errors
                    : [];

                row.appendChild(
                    createCell(
                        errors.length ? errors.join(", ") : "—",
                        "validation-errors"
                    )
                );

                importResultsBody.appendChild(row);
            });
        }

        const hasFailedRows =
            Number(data.failed_rows ?? failedRecords.length) > 0 &&
            failedRecords.length > 0;

        downloadFailedButton.classList.toggle(
            "hidden",
            !hasFailedRows
        );
    }

    closeResults.addEventListener("click", () => {
        importResults.classList.add("hidden");
    });

    // ------------------------------
    // Download failed records report
    // ------------------------------

    downloadFailedButton.addEventListener("click", async () => {
        if (!failedRecords.length) {
            showError(
                uploadError,
                "There are no failed records available to download."
            );
            return;
        }

        downloadFailedButton.disabled = true;
        downloadFailedButton.textContent = "Preparing report...";

        try {
            const response = await fetch(API.failedReport, {
                method: "POST",
                credentials: "same-origin",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken()
                }),
                body: JSON.stringify({
                    failed_records: failedRecords
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.detail ||
                    errorData.error ||
                    errorData.message ||
                    "Unable to download the failed report."
            );
}

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = objectUrl;
            link.download = "failed_employees.csv";

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            showError(uploadError, error.message);
        } finally {
            downloadFailedButton.disabled = false;
            downloadFailedButton.textContent = "Download failed records";
        }
    });

    // ------------------------------
    // Build employee filters
    // ------------------------------

    function buildEmployeeUrl() {
        const params = new URLSearchParams();

        const search = searchInput.value.trim();
        const department = departmentInput.value.trim();
        const minSalary = minSalaryInput.value.trim();
        const maxSalary = maxSalaryInput.value.trim();
        const pageSize = pageSizeInput.value;

        if (search) {
            params.set("search", search);
        }

        if (department) {
            params.set("department", department);
        }

        if (minSalary !== "") {
            params.set("min_salary", minSalary);
        }

        if (maxSalary !== "") {
            params.set("max_salary", maxSalary);
        }

        params.set("page_size", pageSize);
        params.set("page", "1");

        return `${API.employees}?${params.toString()}`;
    }

    // ------------------------------
    // Load employee directory
    // ------------------------------

    async function loadEmployees(url = null) {
        hideError(employeeError);
        refreshButton.disabled = true;

        showEmptyRow(
            employeeTableBody,
            6,
            "Loading employees..."
        );

        try {
            const requestUrl = url || buildEmployeeUrl();
            const data = await requestJson(requestUrl);

            const employees = Array.isArray(data.results)
                ? data.results
                : Array.isArray(data.employees)
                    ? data.employees
                    : [];

            totalEmployees = Number(
                data.count ?? employees.length
            );

            nextPageUrl = data.next || null;
            previousPageUrl = data.previous || null;

            const parsedUrl = new URL(requestUrl, window.location.origin);
            currentPage = Number(parsedUrl.searchParams.get("page") || 1);

            employeeCount.textContent =
                `${totalEmployees} employee${totalEmployees === 1 ? "" : "s"}`;

            paginationInfo.textContent =
                `Page ${currentPage} · ${employees.length} shown`;

            previousPageButton.disabled = !previousPageUrl;
            nextPageButton.disabled = !nextPageUrl;

            renderEmployees(employees);
        } catch (error) {
            showError(employeeError, error.message);

            showEmptyRow(
                employeeTableBody,
                6,
                "Could not load employees."
            );

            employeeCount.textContent = "Unavailable";
            paginationInfo.textContent = "Page unavailable";

            nextPageUrl = null;
            previousPageUrl = null;

            previousPageButton.disabled = true;
            nextPageButton.disabled = true;
        } finally {
            refreshButton.disabled = false;
        }
    }

    function renderEmployees(employees) {
        employeeTableBody.replaceChildren();

        if (!employees.length) {
            showEmptyRow(
                employeeTableBody,
                6,
                "No employees found. Try changing your filters or import a file."
            );
            return;
        }

        employees.forEach((employee, index) => {
            const row = document.createElement("tr");

            const rowNumber =
                (currentPage - 1) * Number(pageSizeInput.value) + index + 1;

            row.appendChild(createCell(rowNumber));
            row.appendChild(createCell(employee.name));
            row.appendChild(createCell(employee.email));
            row.appendChild(createCell(employee.department));
            row.appendChild(createCell(formatSalary(employee.salary)));
            row.appendChild(createCell(formatDate(employee.created_at)));

            employeeTableBody.appendChild(row);
        });
    }

    // ------------------------------
    // Search and filter
    // ------------------------------

    filterForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const minValue = minSalaryInput.value.trim();
        const maxValue = maxSalaryInput.value.trim();

        if (minValue !== "" && Number(minValue) < 0) {
            showError(employeeError, "Minimum salary cannot be negative.");
            return;
        }

        if (maxValue !== "" && Number(maxValue) < 0) {
            showError(employeeError, "Maximum salary cannot be negative.");
            return;
        }

        if (
            minValue !== "" &&
            maxValue !== "" &&
            Number(minValue) > Number(maxValue)
        ) {
            showError(
                employeeError,
                "Minimum salary cannot exceed maximum salary."
            );
            return;
        }

        loadEmployees();
    });

    clearFiltersButton.addEventListener("click", () => {
        filterForm.reset();
        loadEmployees();
    });

    refreshButton.addEventListener("click", () => {
        loadEmployees();
    });

    // ------------------------------
    // Pagination
    // ------------------------------

    previousPageButton.addEventListener("click", () => {
        if (previousPageUrl) {
            loadEmployees(previousPageUrl);
        }
    });

    nextPageButton.addEventListener("click", () => {
        if (nextPageUrl) {
            loadEmployees(nextPageUrl);
        }
    });

    // Initial employee directory load.
    loadEmployees();
});
