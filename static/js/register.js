
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    const errorBox = document.getElementById("registerError");
    const statusBox = document.getElementById("registerStatus");
    const submitButton = document.getElementById("registerButton");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        errorBox.textContent = "";
        errorBox.classList.add("hidden");
        statusBox.textContent = "";

        const username = document.getElementById("username").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const password2 = document.getElementById("password2").value;

        if (password !== password2) {
            errorBox.textContent = "Passwords do not match.";
            errorBox.classList.remove("hidden");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Creating account...";
        statusBox.textContent = "Please wait...";

        try {
            const response = await fetch("/users/register/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": document.querySelector(
                        "[name=csrfmiddlewaretoken]"
                    ).value,
                },
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    password2,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const messages = Object.entries(data).flatMap(
                    ([field, errors]) => {
                        const list = Array.isArray(errors) ? errors : [errors];
                        return list.map((message) => {
                            const label = field === "non_field_errors"
                                ? ""
                                : `${field}: `;
                            return `${label}${message}`;
                        });
                    }
                );

                throw new Error(
                    messages.join(" ") || "Registration failed."
                );
            }

            statusBox.textContent =
                "Account created successfully. Redirecting to login...";

            window.location.href = "/login/";
        } catch (error) {
            errorBox.textContent =
                error.message || "Unable to register. Please try again.";
            errorBox.classList.remove("hidden");
            statusBox.textContent = "";
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Create account";
        }
    });
});