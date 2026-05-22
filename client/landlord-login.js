const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const form           = document.getElementById("loginForm");
const statusEl       = document.getElementById("authStatus");
const unverifiedState = document.getElementById("unverifiedState");
const resendBtn      = document.getElementById("resendBtn");
const resendStatus   = document.getElementById("resendStatus");

let attemptedEmail = "";

if (localStorage.getItem("cozi_landlord_token")) {
  window.location.href = "landlord-dashboard.html";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", "");

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API_BASE}/api/landlord/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.status === 403 && data.error === "not_verified") {
      attemptedEmail = email;
      unverifiedState.hidden = false;
      setStatus("Your email isn't verified yet.", "error");
      return;
    }

    if (!res.ok) {
      setStatus(data.error || "Something went wrong.", "error");
      return;
    }

    localStorage.setItem("cozi_landlord_token", data.token);
    localStorage.setItem("cozi_landlord_name", data.fullName || "");
    window.location.href = "landlord-dashboard.html";
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
      body: JSON.stringify({ email: attemptedEmail }),
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
