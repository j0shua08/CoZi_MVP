const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const IMAGE_PLACEHOLDER = "https://placehold.co/80x64/f5ecdf/6d5a4a?text=CoZi";
const token = localStorage.getItem("cozi_landlord_token");

if (!token) window.location.href = "landlord-login.html";

const landlordNameEl      = document.getElementById("landlordName");
const verificationBanner  = document.getElementById("verificationBanner");
const listingsContainer   = document.getElementById("listingsContainer");
const statViews           = document.getElementById("statViews");
const statInquiries       = document.getElementById("statInquiries");
const statActive          = document.getElementById("statActive");

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("cozi_landlord_token");
  localStorage.removeItem("cozi_landlord_name");
  window.location.href = "landlord-login.html";
});

// ── Utilities ─────────────────────────────────────────────────

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); } catch { return n; }
}

function getPrimaryImageUrl(listing) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const cover  = images.find((i) => i.label === "cover photo")?.url;
  return cover || images[0]?.url || listing.imageUrl || IMAGE_PLACEHOLDER;
}

function statusLabel(status) {
  return { available: "Available", rented: "Rented", hidden: "Hidden" }[status] ?? status;
}

// ── Load profile ───────────────────────────────────────────────

async function loadProfile() {
  try {
    const res  = await fetch(`${API_BASE}/api/landlord/me`, { headers: authHeaders() });
    if (res.status === 401) { window.location.href = "landlord-login.html"; return; }
    const data = await res.json();

    landlordNameEl.textContent = data.fullName || "Landlord";

    return data.isVerified ?? false;
  } catch {
    landlordNameEl.textContent = localStorage.getItem("cozi_landlord_name") || "Landlord";
    return false;
  }
}

// ── Load stats ────────────────────────────────────────────────

async function loadStats() {
  try {
    const res  = await fetch(`${API_BASE}/api/landlord/stats`, { headers: authHeaders() });
    const data = await res.json();
    statViews.textContent      = data.totalViews ?? 0;
    statInquiries.textContent  = data.totalInquiries ?? 0;
    statActive.textContent     = data.activeListings ?? 0;
  } catch {
    statViews.textContent = statInquiries.textContent = statActive.textContent = "—";
  }
}

// ── Load listings ─────────────────────────────────────────────

async function loadListings() {
  listingsContainer.innerHTML = `<p style="color:var(--text-muted);font-size:.9rem;">Loading…</p>`;

  try {
    const res      = await fetch(`${API_BASE}/api/landlord/listings`, { headers: authHeaders() });
    const listings = await res.json();

    if (!listings.length) {
      renderEmpty();
      return [];
    }

    listingsContainer.innerHTML = listings.map(cardHTML).join("");
    bindCardActions();
    return listings;
  } catch {
    listingsContainer.innerHTML = `<p style="color:var(--error);font-size:.9rem;">Failed to load listings. Please refresh.</p>`;
    return [];
  }
}

function renderEmpty() {
  listingsContainer.innerHTML = `
    <div class="dashboard-empty">
      <h3>No listings yet</h3>
      <p>Add your first property and start reaching students looking for housing near campus.</p>
      <a href="landlord-add-listing.html" class="button-link">Add your first listing</a>
    </div>
  `;
}

function cardHTML(listing) {
  const id        = escapeHTML(String(listing.id));
  const title     = escapeHTML(listing.title || "Untitled listing");
  const location  = escapeHTML(listing.location || "");
  const price     = escapeHTML(String(listing.price));
  const imageUrl  = escapeHTML(getPrimaryImageUrl(listing));
  const status    = listing.status || "available";
  const label     = escapeHTML(statusLabel(status));
  const isHidden  = status === "hidden";

  const actionsHTML = isHidden
    ? `<button class="btn-ghost-sm btn-ghost-sm--restore" data-action="restore" data-id="${id}">Restore listing</button>`
    : `<select class="status-select" data-id="${id}" aria-label="Change status for ${title}">
         <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
         <option value="rented"    ${status === "rented"    ? "selected" : ""}>Rented</option>
       </select>`;

  return `
    <article class="landlord-card" data-id="${id}">
      <a class="landlord-card__link" href="listing?id=${id}" aria-label="View ${title}">
        <img class="landlord-card__thumb" src="${imageUrl}" alt="${title}" />
        <div class="landlord-card__info">
          <p class="landlord-card__title">${title}</p>
          <p class="landlord-card__sub">${location}${location && price ? " · " : ""}${price ? `₱${peso(Number(listing.price))}/mo` : ""}</p>
          <span class="landlord-card__status landlord-card__status--${escapeHTML(status)}">${label}</span>
        </div>
      </a>
      <div class="landlord-card__actions">
        ${actionsHTML}
        <button class="btn-ghost-sm" data-action="edit" data-id="${id}">Edit</button>
        <button class="btn-ghost-sm btn-ghost-sm--danger" data-action="delete" data-id="${id}">Delete</button>
      </div>
    </article>
  `;
}

// ── Card actions ──────────────────────────────────────────────

function bindCardActions() {
  listingsContainer.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", () => updateStatus(Number(select.dataset.id), select.value));
  });

  listingsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "restore") confirmRestore(id);
    if (btn.dataset.action === "edit")    window.location.href = `landlord-add-listing.html?id=${id}`;
    if (btn.dataset.action === "delete")  confirmDelete(id);
  });
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/landlord/listings/${id}/status`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    await loadStats();
  } catch {
    alert("Failed to update status. Please try again.");
    await loadListings();
  }
}

function confirmRestore(id) {
  const confirmed = confirm(
    "Is this unit still available for rent?\n\nClicking OK will restore it as an active listing visible to students."
  );
  if (confirmed) updateStatus(id, "available");
}

async function confirmDelete(id) {
  if (!confirm("Delete this listing? This cannot be undone.")) return;
  try {
    const res = await fetch(`${API_BASE}/api/landlord/listings/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error();
    await Promise.all([loadListings(), loadStats()]);
  } catch {
    alert("Failed to delete listing. Please try again.");
  }
}

// ── Init ──────────────────────────────────────────────────────

Promise.all([loadProfile(), loadStats(), loadListings()]).then(([isVerified, , listings]) => {
  if (!isVerified && listings.length > 0) verificationBanner.hidden = false;
});
