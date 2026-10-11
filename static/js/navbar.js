"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const loginLink = document.getElementById("loginNavLink");
    const dashboardLink = document.getElementById("dashboardNavLink");
    const logoutButton = document.getElementById("navbarLogoutButton");
    const toggleButton = document.getElementById("navbarToggle");
    const navbarLinks = document.getElementById("navbarLinks");

    function updateNavbar() {
        const isLoggedIn = Boolean(
            sessionStorage.getItem("accessToken")
        );

        loginLink?.classList.toggle("hidden", isLoggedIn);
        dashboardLink?.classList.toggle("hidden", !isLoggedIn);
        logoutButton?.classList.toggle("hidden", !isLoggedIn);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", function (event) {
            event.preventDefault();

            // Clear authentication tokens
            sessionStorage.clear();

            // Redirect to login after clearing the session
            window.location.replace("/login/");
        });
    }

    if (toggleButton && navbarLinks) {
        toggleButton.addEventListener("click", () => {
            const isOpen = navbarLinks.classList.toggle("open");
            toggleButton.setAttribute("aria-expanded", String(isOpen));
        });
    }

    updateNavbar();
});