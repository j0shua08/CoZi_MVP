const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const form     = document.getElementById("forgotForm");
const statusEl = document.getElementById("authStatus");
const submitBtn = form.querySelector("button[type=submit]");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", "");
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  const email = document.getElementById("email").value.trim();

  try {
    const res  = await fetch(`${API_BASE}/api/landlord/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setStatus(data.message || "Check your inbox for a reset link.", "success");
    form.querySelector("input").disabled = true;
    submitBtn.textContent = "Sent";
  } catch {
    setStatus("Unable to connect. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset link";
  }
});

function setStatus(message, tone) {
  statusEl.textContent = message;
  statusEl.className = `auth-status${tone ? ` ${tone}` : ""}`;
}
