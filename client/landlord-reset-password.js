const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const form         = document.getElementById("resetForm");
const statusEl     = document.getElementById("authStatus");
const successState = document.getElementById("successState");
const submitBtn    = form.querySelector("button[type=submit]");

const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  statusEl.textContent = "Invalid reset link. Please request a new one.";
  statusEl.className = "auth-status error";
  submitBtn.disabled = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", "");

  const password        = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  try {
    const res  = await fetch(`${API_BASE}/api/landlord/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Something went wrong.", "error");
      return;
    }

    form.hidden = true;
    successState.hidden = false;
  } catch {
    setStatus("Unable to connect. Please try again.", "error");
  }
});

function setStatus(message, tone) {
  statusEl.textContent = message;
  statusEl.className = `auth-status${tone ? ` ${tone}` : ""}`;
}
