const API_BASE = "http://localhost:3001";

const form = document.getElementById("loginForm");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Logging in...";
  statusEl.className = "status";

  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Login failed");
    }

    const data = await res.json();
    localStorage.setItem("cozi_admin_token", data.token);

    window.location.href = "admin.html";
  } catch (err) {
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.className = "status error";
  }
});