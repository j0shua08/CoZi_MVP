const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const verifyState = document.getElementById("verifyState");

async function verify() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get("token");

  if (!token) {
    show("❌", "Invalid link", "This verification link is missing a token. Try clicking the link in your email again.", true);
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/api/landlord/verify-email?token=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok) {
      show("❌", "Verification failed", data.error || "Something went wrong.", true);
      return;
    }

    show("✅", "Email verified!", "Your account is active. You can now log in to your landlord dashboard.", false);

    setTimeout(() => {
      window.location.href = "landlord-login.html";
    }, 2500);
  } catch {
    show("❌", "Connection error", "Could not reach the server. Please try again.", true);
  }
}

function show(icon, title, message, isError) {
  verifyState.className = `auth-verify${isError ? " error" : ""}`;
  verifyState.innerHTML = `
    <p class="auth-verify__icon">${icon}</p>
    <h2>${title}</h2>
    <p>${message}</p>
    ${isError
      ? `<a class="button-link button-link--ghost" href="landlord-signup.html">Back to sign up</a>`
      : `<a class="auth-link" href="landlord-login.html">Go to login →</a>`
    }
  `;
}

verify();
