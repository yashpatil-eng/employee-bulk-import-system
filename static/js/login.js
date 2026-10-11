
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginButton = document.getElementById("loginButton");
    const loginError = document.getElementById("loginError");
    const loginStatus = document.getElementById("loginStatus");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        loginError.textContent = "";
        loginError.classList.add("hidden");
        loginStatus.textContent = "";

        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";

        try {
            const response = await fetch("/api/token/", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: usernameInput.value.trim(),
                    password: passwordInput.value
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Invalid username or password."
                );
            }

            if (!data.access || !data.refresh) {
                throw new Error("The server did not return the expected tokens.");
            }

            // Store tokens for this browser tab/session.
            sessionStorage.setItem("accessToken", data.access);
            sessionStorage.setItem("refreshToken", data.refresh);

            loginStatus.textContent = "Login successful. Redirecting...";
            window.location.assign("/");
        } catch (error) {
            loginError.textContent =
                error.message || "Unable to sign in. Please try again.";
            loginError.classList.remove("hidden");
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Sign in";
        }
    });
});
