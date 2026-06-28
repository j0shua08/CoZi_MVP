const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const token = localStorage.getItem("cozi_admin_token");
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/120x90/f5ecdf/6d5a4a?text=CoZi";
const PRESET_AMENITIES = [
  "Aircon", "WiFi", "Parking", "Pool", "Gym", "Study Hall", "Function Hall",
  "CCTV", "Generator", "Elevator", "Washer/Dryer", "Water included", "Electric included",
];

if (!token) window.location.href = "admin-login.html";

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("cozi_admin_token");
  window.location.href = "admin-login.html";
});

// ── Tab switching ─────────────────────────────────────────────

const tabs = document.querySelectorAll(".admin-tab");
const panels = document.querySelectorAll(".admin-panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("admin-tab--active"));
    panels.forEach((p) => p.classList.add("admin-panel--hidden"));
    tab.classList.add("admin-tab--active");
    const panel = document.getElementById(`panel-${tab.dataset.tab}`);
    if (panel) panel.classList.remove("admin-panel--hidden");
    if (tab.dataset.tab === "overview") loadOverviewStats();
    if (tab.dataset.tab === "landlords") loadLandlords();
    if (tab.dataset.tab === "search-trends") loadSearchTrends();
  });
});

// ── Utilities ────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function titleCaseLabel(label) {
  return String(label ?? "").split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function normalizeListingImages(listing) {
  const imageMap = new Map();
  const rawImages = Array.isArray(listing?.images) ? listing.images : [];
  rawImages.forEach((image) => {
    if (!image || typeof image !== "object") return;
    const label = String(image.label ?? "").trim().toLowerCase();
    const url = String(image.url ?? "").trim();
    if (!IMAGE_LABELS.includes(label) || !url || imageMap.has(label)) return;
    imageMap.set(label, url);
  });
  const fallbackUrl = String(listing?.imageUrl ?? "").trim();
  if (!imageMap.size && fallbackUrl) imageMap.set("cover photo", fallbackUrl);
  return IMAGE_LABELS.filter((label) => imageMap.has(label)).map((label) => ({ label, url: imageMap.get(label) }));
}

function getPrimaryImageUrl(listing) {
  const images = normalizeListingImages(listing);
  return images.find((i) => i.label === "cover photo")?.url || images[0]?.url || String(listing?.imageUrl ?? "").trim() || IMAGE_PLACEHOLDER;
}

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); } catch { return n; }
}

// ── Overview stats ────────────────────────────────────────────

let statusDonutChart = null;

async function loadOverviewStats() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: authHeaders() });
    const data = await res.json();

    document.getElementById("oStatAvailable").textContent  = data.listings.available;
    document.getElementById("oStatRented").textContent     = data.listings.rented;
    document.getElementById("oStatHidden").textContent     = data.listings.hidden;
    document.getElementById("oStatLandlords").textContent  = `${data.landlords.total} (${data.landlords.verified} verified)`;
    document.getElementById("oStatViews").textContent      = data.platform.totalViews;
    document.getElementById("oStatInquiries").textContent  = data.platform.totalInquiries;

    renderStatusDonut(data.listings);
    renderAttentionList(data);
  } catch {
    document.getElementById("oStatAvailable").textContent = "—";
  }
}

function renderStatusDonut(listings) {
  const ctx = document.getElementById("statusDonut").getContext("2d");
  if (statusDonutChart) statusDonutChart.destroy();
  statusDonutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Available", "Rented", "Hidden"],
      datasets: [{
        data: [listings.available, listings.rented, listings.hidden],
        backgroundColor: ["#3e7a59", "#b5c9a5", "#d4b483"],
        borderWidth: 0,
      }],
    },
    options: {
      cutout: "65%",
      plugins: {
        legend: { position: "bottom", labels: { font: { family: "Plus Jakarta Sans", size: 12 }, color: "#7d7063" } },
      },
    },
  });
}

function renderAttentionList(data) {
  const list = document.getElementById("attentionList");
  const items = [];

  if (data.listings.zeroViews > 0)
    items.push(`<li class="admin-attention-item admin-attention-item--warn">${data.listings.zeroViews} listing${data.listings.zeroViews > 1 ? "s" : ""} with 0 views</li>`);
  if (data.listings.hidden > 0)
    items.push(`<li class="admin-attention-item">${data.listings.hidden} listing${data.listings.hidden > 1 ? "s" : ""} hidden by landlord</li>`);
  if (data.landlords.total - data.landlords.verified > 0)
    items.push(`<li class="admin-attention-item admin-attention-item--warn">${data.landlords.total - data.landlords.verified} landlord${(data.landlords.total - data.landlords.verified) > 1 ? "s" : ""} not yet CoZi-verified</li>`);
  if (data.landlords.noListings > 0)
    items.push(`<li class="admin-attention-item">${data.landlords.noListings} landlord${data.landlords.noListings > 1 ? "s" : ""} signed up with no listings</li>`);

  list.innerHTML = items.length
    ? items.join("")
    : `<li class="admin-attention-item admin-attention-item--ok">All good — nothing needs attention.</li>`;
}

// ── Search Trends ─────────────────────────────────────────────

let topQueriesChart = null;
let priceRangeChart = null;
let amenityChart    = null;

async function loadSearchTrends() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/search-trends`, { headers: authHeaders() });
    const data = await res.json();

    document.getElementById("tStatTotal").textContent = data.totalSearches;
    document.getElementById("tStatZero").textContent  = data.zeroResultQueries.reduce((s, q) => s + q.count, 0);

    renderTopQueriesBar(data.topQueries);
    renderZeroResultsList(data.zeroResultQueries);
    renderPriceRangeBar(data.priceBuckets);
    renderAmenityBar(data.topAmenities);
  } catch {
    document.getElementById("tStatTotal").textContent = "—";
  }
}

function renderTopQueriesBar(queries) {
  const noMsg = document.getElementById("noQueriesMsg");
  const canvas = document.getElementById("topQueriesBar");
  if (!queries.length) { noMsg.hidden = false; canvas.hidden = true; return; }
  noMsg.hidden = true; canvas.hidden = false;
  const ctx = canvas.getContext("2d");
  if (topQueriesChart) topQueriesChart.destroy();
  topQueriesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: queries.map((q) => q.term),
      datasets: [{ data: queries.map((q) => q.count), backgroundColor: "#3e7a59", borderRadius: 6 }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#7d7063" }, grid: { color: "#e8e0d6" } },
        y: { ticks: { color: "#2b2116", font: { family: "Plus Jakarta Sans" } }, grid: { display: false } },
      },
    },
  });
}

function renderZeroResultsList(queries) {
  const el = document.getElementById("zeroResultsList");
  if (!queries.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem;">No searches with zero results yet.</p>`;
    return;
  }
  el.innerHTML = queries.map((q, i) =>
    `<div class="admin-zero-item">
      <span class="admin-zero-rank">${i + 1}</span>
      <span class="admin-zero-term">${escapeHTML(q.term)}</span>
      <span class="admin-zero-count">${q.count}×</span>
    </div>`
  ).join("");
}

function renderPriceRangeBar(buckets) {
  const ctx = document.getElementById("priceRangeBar").getContext("2d");
  if (priceRangeChart) priceRangeChart.destroy();
  priceRangeChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(buckets),
      datasets: [{ data: Object.values(buckets), backgroundColor: "#b5c9a5", borderRadius: 6 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#7d7063", font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: "#7d7063" }, grid: { color: "#e8e0d6" } },
      },
    },
  });
}

function renderAmenityBar(amenities) {
  const ctx = document.getElementById("amenityBar").getContext("2d");
  if (amenityChart) amenityChart.destroy();
  if (!amenities.length) return;
  amenityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: amenities.map((a) => a.amenity),
      datasets: [{ data: amenities.map((a) => a.count), backgroundColor: "#d4b483", borderRadius: 6 }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#7d7063" }, grid: { color: "#e8e0d6" } },
        y: { ticks: { color: "#2b2116", font: { family: "Plus Jakarta Sans", size: 11 } }, grid: { display: false } },
      },
    },
  });
}

// ── Image handling ───────────────────────────────────────────

const form           = document.getElementById("listingForm");
const statusEl       = document.getElementById("status");
const adminListingsEl = document.getElementById("adminListings");
const formHeading    = document.getElementById("formHeading");
const cancelEditBtn  = document.getElementById("cancelEditBtn");
const submitBtn      = document.getElementById("submitBtn");

const imageInputs = IMAGE_LABELS.map((label) => ({
  label,
  input: document.querySelector(`[data-image-label="${label}"]`),
  preview: document.querySelector(`[data-image-preview="${label}"]`),
  removeButton: document.querySelector(`[data-image-remove="${label}"]`),
}));

const titleInput        = document.getElementById("titleInput");
const titleCounter      = document.getElementById("titleCounter");
const descInput         = document.getElementById("descriptionInput");
const buildingInput     = document.getElementById("buildingName");
const areaInput         = document.getElementById("areaInput");
const bedroomsInput     = document.getElementById("bedroomsInput");
const bathroomsInput    = document.getElementById("bathroomsInput");
const furnishedInput    = document.getElementById("furnishedInput");
const petsAllowedInput  = document.getElementById("petsAllowedInput");
const sizeInput         = document.getElementById("sizeInput");
const floorInput        = document.getElementById("floorInput");
const leaseTermInput    = document.getElementById("leaseTermInput");
const advanceDepositInput = document.getElementById("advanceDepositInput");
const priceInput        = document.getElementById("priceInput");
const pricePreview      = document.getElementById("pricePreview");
const contactInput      = document.getElementById("contactInput");
const contactHint       = document.getElementById("contactHint");
const customAmenities   = document.getElementById("customAmenities");

let editingId = null;
let currentListingImages = [];
const previewObjectUrls = new Map();

titleInput.addEventListener("input", () => { titleCounter.textContent = `${titleInput.value.length}/80`; });
priceInput.addEventListener("input", () => updatePricePreview(priceInput.value));

contactInput.addEventListener("input", () => {
  const val = contactInput.value.trim();
  if (!val) { contactHint.textContent = ""; contactHint.className = "admin-field-hint"; return; }
  if (/^09\d{9}$/.test(val)) {
    contactHint.textContent = "Looks good!";
    contactHint.className = "admin-field-hint admin-field-hint--ok";
  } else {
    contactHint.textContent = "Must start with 09 and be exactly 11 digits.";
    contactHint.className = "admin-field-hint admin-field-hint--error";
  }
});

function updatePricePreview(value) {
  const n = Number(value);
  if (!value || isNaN(n) || n <= 0) {
    pricePreview.textContent = "Enter a price to see the formatted amount.";
    pricePreview.classList.remove("admin-price-preview--active");
    return;
  }
  pricePreview.textContent = `₱${peso(n)} per month`;
  pricePreview.classList.add("admin-price-preview--active");
}

function clearPreviewObjectUrl(label) {
  const url = previewObjectUrls.get(label);
  if (!url) return;
  URL.revokeObjectURL(url);
  previewObjectUrls.delete(label);
}

function renderImagePreviews() {
  const currentImageMap = new Map(
    normalizeListingImages({ images: currentListingImages }).map((i) => [i.label, i.url])
  );
  imageInputs.forEach(({ label, input, preview, removeButton }) => {
    if (!input || !preview) return;
    clearPreviewObjectUrl(label);
    const file = input.files?.[0];
    const existingUrl = currentImageMap.get(label);
    let previewUrl = existingUrl;
    let helperCopy = existingUrl ? "Current image will stay unless you replace it." : `No ${label} photo uploaded.`;
    if (file) {
      previewUrl = URL.createObjectURL(file);
      previewObjectUrls.set(label, previewUrl);
      helperCopy = `${file.name} is ready to upload.`;
    }
    if (!previewUrl) {
      preview.textContent = helperCopy;
      if (removeButton) removeButton.disabled = true;
      return;
    }
    preview.innerHTML = `<img src="${escapeHTML(previewUrl)}" alt="${escapeHTML(titleCaseLabel(label))}" /><span class="admin-image-slot__note">${escapeHTML(helperCopy)}</span>`;
    if (removeButton) removeButton.disabled = false;
  });
}

function removeImageSlot(label) {
  currentListingImages = currentListingImages.filter((i) => i.label !== label);
  const slot = imageInputs.find((i) => i.label === label);
  if (slot?.input) slot.input.value = "";
  renderImagePreviews();
}

async function uploadSingleImage(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", headers: authHeaders(), body: fd });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Image upload failed"); }
  return (await res.json()).publicUrl;
}

async function uploadSelectedImages() {
  const uploads = await Promise.all(
    imageInputs.map(async ({ label, input }) => {
      const file = input?.files?.[0];
      if (!file) return null;
      const url = await uploadSingleImage(file);
      return { label, url };
    })
  );
  return uploads.filter(Boolean);
}

imageInputs.forEach(({ input }) => { input?.addEventListener("change", renderImagePreviews); });
imageInputs.forEach(({ label, removeButton }) => { removeButton?.addEventListener("click", () => removeImageSlot(label)); });

// ── Field helpers ────────────────────────────────────────────

function collectAmenities() {
  const checked = [...document.querySelectorAll('input[name="amenity"]:checked')].map((cb) => cb.value);
  const custom = (customAmenities.value.trim() || "").split(",").map((a) => a.trim()).filter(Boolean);
  return [...checked, ...custom];
}

function collectLocation() {
  return [buildingInput.value.trim(), areaInput.value.trim()].filter(Boolean).join(", ");
}

function validateContact() {
  return /^09\d{9}$/.test(contactInput.value.trim());
}

function resetForm() {
  titleInput.value = ""; titleCounter.textContent = "0/80";
  descInput.value = ""; buildingInput.value = ""; areaInput.value = "";
  bedroomsInput.value = ""; bathroomsInput.value = ""; furnishedInput.value = "";
  petsAllowedInput.value = ""; sizeInput.value = ""; floorInput.value = "";
  leaseTermInput.value = ""; advanceDepositInput.value = "";
  priceInput.value = ""; pricePreview.textContent = "Enter a price to see the formatted amount.";
  pricePreview.classList.remove("admin-price-preview--active");
  contactInput.value = ""; contactHint.textContent = ""; contactHint.className = "admin-field-hint";
  document.querySelectorAll('input[name="amenity"]').forEach((cb) => { cb.checked = false; });
  customAmenities.value = "";
  imageInputs.forEach(({ input }) => { if (input) input.value = ""; });
  renderImagePreviews();
  editingId = null;
  currentListingImages = [];
  formHeading.textContent = "Add Listing";
  submitBtn.textContent = "Add Listing";
  cancelEditBtn.hidden = true;
  statusEl.textContent = "";
}

cancelEditBtn.addEventListener("click", resetForm);

// ── Load listings ────────────────────────────────────────────

async function loadListings() {
  const res = await fetch(`${API_BASE}/api/listings`);
  const listings = await res.json();
  adminListingsEl.innerHTML = "";
  if (!listings.length) { adminListingsEl.innerHTML = "<p>No listings yet.</p>"; return; }
  listings.forEach((listing) => {
    const row = document.createElement("div");
    const imageCount = normalizeListingImages(listing).length;
    row.className = "card";
    row.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <img src="${escapeHTML(getPrimaryImageUrl(listing))}" style="width:120px; height:90px; object-fit:cover; border-radius:10px;" alt="${escapeHTML(listing.title || "Listing preview")}" />
        <div style="flex:1;">
          <strong>${escapeHTML(listing.title)}</strong><br/>
          <small>${escapeHTML(listing.location)} • ₱${escapeHTML(String(listing.price))}</small><br/>
          <small>${imageCount} photo${imageCount === 1 ? "" : "s"} · ${listing.viewCount ?? 0} views · ${listing.inquiryCount ?? 0} inquiries</small>
          <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button data-action="edit" data-id="${listing.id}">Edit</button>
            <button data-action="delete" data-id="${listing.id}">Delete</button>
            <label class="verify-toggle" style="margin-left:4px;">
              <input type="checkbox" data-action="verify" data-id="${listing.id}" ${listing.verified ? "checked" : ""} />
              <span data-verify-label="${listing.id}">${listing.verified ? "✓ Verified" : "Not verified"}</span>
            </label>
          </div>
        </div>
      </div>
    `;
    adminListingsEl.appendChild(row);
  });

  adminListingsEl.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      const { action, id } = button.dataset;
      if (action === "edit") await startEdit(Number(id));
      else if (action === "delete") await deleteListing(Number(id));
    });
  });

  adminListingsEl.querySelectorAll("input[data-action='verify']").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const id = Number(checkbox.dataset.id);
      const verified = checkbox.checked;
      const label = adminListingsEl.querySelector(`[data-verify-label="${id}"]`);
      try {
        const res = await fetch(`${API_BASE}/api/admin/listings/${id}/verify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ verified }),
        });
        if (!res.ok) throw new Error();
        if (label) label.textContent = verified ? "✓ Verified" : "Not verified";
      } catch {
        alert("Failed to update verification. Please try again.");
        checkbox.checked = !verified;
      }
    });
  });
}

// ── Start edit ───────────────────────────────────────────────

async function startEdit(id) {
  const res = await fetch(`${API_BASE}/api/listings/${id}`);
  const listing = await res.json();

  editingId = id;
  currentListingImages = normalizeListingImages(listing);
  imageInputs.forEach(({ input }) => { if (input) input.value = ""; });
  renderImagePreviews();

  titleInput.value = listing.title || ""; titleCounter.textContent = `${titleInput.value.length}/80`;
  descInput.value = listing.description || "";

  const locationStr = String(listing.location || "");
  const commaIdx = locationStr.indexOf(", ");
  buildingInput.value = commaIdx !== -1 ? locationStr.slice(0, commaIdx) : locationStr;
  areaInput.value = commaIdx !== -1 ? locationStr.slice(commaIdx + 2) : "";

  bedroomsInput.value = listing.bedrooms || ""; bathroomsInput.value = listing.bathrooms || "";
  furnishedInput.value = listing.furnished || ""; petsAllowedInput.value = listing.petsAllowed || "";
  sizeInput.value = listing.sizesqm || ""; floorInput.value = listing.floor || "";
  leaseTermInput.value = listing.leaseTerm || ""; advanceDepositInput.value = listing.advanceDeposit || "";

  const amenityList = Array.isArray(listing.amenities) ? listing.amenities : [];
  document.querySelectorAll('input[name="amenity"]').forEach((cb) => { cb.checked = amenityList.includes(cb.value); });
  customAmenities.value = amenityList.filter((a) => !PRESET_AMENITIES.includes(a)).join(", ");

  priceInput.value = listing.price || ""; updatePricePreview(listing.price);
  contactInput.value = listing.contactNumber || ""; contactHint.textContent = ""; contactHint.className = "admin-field-hint";

  formHeading.textContent = `Edit Listing #${id}`;
  submitBtn.textContent = "Save Changes";
  cancelEditBtn.hidden = false;
  statusEl.textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Delete listing ───────────────────────────────────────────

async function deleteListing(id) {
  if (!confirm(`Delete listing ID ${id}?`)) return;
  const res = await fetch(`${API_BASE}/api/listings/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || "Failed to delete"); return; }
  await loadListings();
}

// ── Form submit ──────────────────────────────────────────────

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateContact()) {
    statusEl.textContent = "Contact number must start with 09 and be exactly 11 digits.";
    statusEl.className = "status error";
    contactInput.focus();
    return;
  }
  statusEl.textContent = editingId ? "Updating..." : "Saving...";
  statusEl.className = "status";
  try {
    const uploadedImages = await uploadSelectedImages();
    const imageMap = new Map(currentListingImages.map((i) => [i.label, i.url]));
    uploadedImages.forEach((i) => imageMap.set(i.label, i.url));
    const images = IMAGE_LABELS.filter((l) => imageMap.has(l)).map((l) => ({ label: l, url: imageMap.get(l) }));
    const coverPhotoUrl = imageMap.get("cover photo") || images[0]?.url || null;

    const payload = {
      title: titleInput.value.trim(), description: descInput.value.trim(),
      location: collectLocation(), amenities: collectAmenities(),
      price: Number(priceInput.value.trim()), contactNumber: contactInput.value.trim(),
      bedrooms: bedroomsInput.value || null, bathrooms: bathroomsInput.value || null,
      furnished: furnishedInput.value || null, petsAllowed: petsAllowedInput.value || null,
      sizesqm: sizeInput.value.trim() ? Number(sizeInput.value.trim()) : null,
      floor: floorInput.value.trim() ? Number(floorInput.value.trim()) : null,
      leaseTerm: leaseTermInput.value || null, advanceDeposit: advanceDepositInput.value.trim() || null,
      imageUrl: coverPhotoUrl, images,
    };

    const url = editingId ? `${API_BASE}/api/listings/${editingId}` : `${API_BASE}/api/listings`;
    const res = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Request failed"); }
    const saved = await res.json();
    statusEl.textContent = editingId ? `Updated listing (ID: ${saved.id})` : `Listing added (ID: ${saved.id})`;
    statusEl.className = "status success";
    resetForm();
    await loadListings();
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "status error";
  }
});

// ── Landlord verification ────────────────────────────────────

const landlordsTableEl = document.getElementById("landlordsTable");

async function loadLandlords() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/landlords`, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    renderLandlordsTable(await res.json());
  } catch {
    landlordsTableEl.innerHTML = `<p style="color:var(--error);font-size:.875rem;">Failed to load landlords.</p>`;
  }
}

function renderLandlordsTable(landlords) {
  if (!landlords.length) {
    landlordsTableEl.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem;">No landlords have signed up yet.</p>`;
    return;
  }
  landlordsTableEl.innerHTML = `
    <table class="landlord-table">
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Email verified</th><th>Listings</th><th>CoZi verified</th>
        </tr>
      </thead>
      <tbody>
        ${landlords.map((l) => `
          <tr>
            <td>${escapeHTML(l.fullName)}</td>
            <td>${escapeHTML(l.email)}</td>
            <td>${l.emailVerified ? "✓ Yes" : "No"}</td>
            <td>${l._count?.listings ?? 0}</td>
            <td>
              <label class="verify-toggle">
                <input type="checkbox" data-landlord-id="${l.id}" ${l.isVerified ? "checked" : ""} />
                <span>${l.isVerified ? "Verified" : "Not verified"}</span>
              </label>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  landlordsTableEl.querySelectorAll("input[data-landlord-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const id = Number(checkbox.dataset.landlordId);
      const isVerified = checkbox.checked;
      const label = checkbox.nextElementSibling;
      try {
        const res = await fetch(`${API_BASE}/api/admin/landlords/${id}/verify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ isVerified }),
        });
        if (!res.ok) throw new Error();
        label.textContent = isVerified ? "Verified" : "Not verified";
      } catch {
        alert("Failed to update verification status.");
        checkbox.checked = !isVerified;
      }
    });
  });
}

// ── Init ─────────────────────────────────────────────────────

renderImagePreviews();
loadOverviewStats();
loadListings();
