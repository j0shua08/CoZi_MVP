const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const form          = document.getElementById("signupForm");
const statusEl      = document.getElementById("authStatus");
const successState  = document.getElementById("successState");
const successEmail  = document.getElementById("successEmail");
const resendBtn     = document.getElementById("resendBtn");
const resendStatus  = document.getElementById("resendStatus");

let submittedEmail = "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", "");

  const fullName       = document.getElementById("fullName").value.trim();
  const email          = document.getElementById("email").value.trim();
  const password       = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  try {
    const res = await fetch(`${API_BASE}/api/landlord/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password, confirmPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Something went wrong.", "error");
      return;
    }

    submittedEmail = email;
    successEmail.textContent = email;
    form.hidden = true;
    successState.hidden = false;
  } catch {
    setStatus("Unable to connect. Please try again.", "error");
  }
});

resendBtn.addEventListener("click", async () => {
  resendBtn.disabled = true;
  resendStatus.textContent = "Sending…";
  resendStatus.className = "auth-status";

  try {
    const res = await fetch(`${API_BASE}/api/landlord/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: submittedEmail }),
    });

    const data = await res.json();
    resendStatus.textContent = data.message || "Sent! Check your inbox.";
    resendStatus.className = "auth-status success";
  } catch {
    resendStatus.textContent = "Could not resend. Try again.";
    resendStatus.className = "auth-status error";
    resendBtn.disabled = false;
  }
});

function setStatus(message, tone) {
  statusEl.textContent = message;
  statusEl.className = `auth-status${tone ? ` ${tone}` : ""}`;
}
