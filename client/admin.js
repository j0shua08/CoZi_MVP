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

const form = document.getElementById("listingForm");
const statusEl = document.getElementById("status");
const adminListingsEl = document.getElementById("adminListings");
const imageInputs = IMAGE_LABELS.map((label) => ({
  label,
  input: document.querySelector(`[data-image-label="${label}"]`),
  preview: document.querySelector(`[data-image-preview="${label}"]`),
  removeButton: document.querySelector(`[data-image-remove="${label}"]`),
}));

// New field refs
const titleInput    = document.getElementById("titleInput");
const titleCounter  = document.getElementById("titleCounter");
const descInput     = document.getElementById("descriptionInput");
const buildingInput = document.getElementById("buildingName");
const areaInput     = document.getElementById("areaInput");
const bedroomsInput      = document.getElementById("bedroomsInput");
const bathroomsInput     = document.getElementById("bathroomsInput");
const furnishedInput     = document.getElementById("furnishedInput");
const petsAllowedInput   = document.getElementById("petsAllowedInput");
const sizeInput          = document.getElementById("sizeInput");
const floorInput         = document.getElementById("floorInput");
const leaseTermInput     = document.getElementById("leaseTermInput");
const advanceDepositInput = document.getElementById("advanceDepositInput");
const priceInput    = document.getElementById("priceInput");
const pricePreview  = document.getElementById("pricePreview");
const contactInput  = document.getElementById("contactInput");
const contactHint   = document.getElementById("contactHint");
const customAmenities = document.getElementById("customAmenities");

let editingId = null;
let currentListingImages = [];
const previewObjectUrls = new Map();

// ── Utilities ────────────────────────────────────────────────

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function titleCaseLabel(label) {
  return String(label ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  return (
    images.find((image) => image.label === "cover photo")?.url ||
    images[0]?.url ||
    String(listing?.imageUrl ?? "").trim() ||
    IMAGE_PLACEHOLDER
  );
}

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); }
  catch { return n; }
}

// ── Live previews / counters ─────────────────────────────────

titleInput.addEventListener("input", () => {
  titleCounter.textContent = `${titleInput.value.length}/80`;
});

priceInput.addEventListener("input", () => updatePricePreview(priceInput.value));

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

contactInput.addEventListener("input", () => {
  const val = contactInput.value.trim();
  if (!val) {
    contactHint.textContent = "";
    contactHint.className = "admin-field-hint";
    return;
  }
  if (/^09\d{9}$/.test(val)) {
    contactHint.textContent = "Looks good!";
    contactHint.className = "admin-field-hint admin-field-hint--ok";
  } else {
    contactHint.textContent = "Must start with 09 and be exactly 11 digits.";
    contactHint.className = "admin-field-hint admin-field-hint--error";
  }
});

// ── Image handling ───────────────────────────────────────────

function clearPreviewObjectUrl(label) {
  const objectUrl = previewObjectUrls.get(label);
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  previewObjectUrls.delete(label);
}

function renderImagePreviews() {
  const currentImageMap = new Map(
    normalizeListingImages({ images: currentListingImages }).map((image) => [image.label, image.url])
  );
  imageInputs.forEach(({ label, input, preview, removeButton }) => {
    if (!input || !preview) return;
    clearPreviewObjectUrl(label);
    const file = input.files?.[0];
    const existingUrl = currentImageMap.get(label);
    let previewUrl = existingUrl;
    let helperCopy = existingUrl
      ? "Current image will stay unless you replace it."
      : `No ${label} photo uploaded.`;
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
    preview.innerHTML = `
      <img src="${escapeHTML(previewUrl)}" alt="${escapeHTML(titleCaseLabel(label))}" />
      <span class="admin-image-slot__note">${escapeHTML(helperCopy)}</span>
    `;
    if (removeButton) removeButton.disabled = false;
  });
}

function removeImageSlot(label) {
  currentListingImages = currentListingImages.filter((image) => image.label !== label);
  const imageSlot = imageInputs.find((item) => item.label === label);
  if (imageSlot?.input) imageSlot.input.value = "";
  renderImagePreviews();
}

async function uploadSingleImage(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Image upload failed");
  }
  const data = await res.json();
  return data.publicUrl;
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

// ── Field collection helpers ─────────────────────────────────

function collectAmenities() {
  const checked = [...document.querySelectorAll('input[name="amenity"]:checked')].map((cb) => cb.value);
  const customRaw = customAmenities.value.trim();
  const custom = customRaw ? customRaw.split(",").map((a) => a.trim()).filter(Boolean) : [];
  return [...checked, ...custom];
}

function collectLocation() {
  const building = buildingInput.value.trim();
  const area = areaInput.value.trim();
  return [building, area].filter(Boolean).join(", ");
}

function validateContact() {
  return /^09\d{9}$/.test(contactInput.value.trim());
}

// ── Reset form ───────────────────────────────────────────────

function resetForm() {
  titleInput.value = "";
  titleCounter.textContent = "0/80";
  descInput.value = "";
  buildingInput.value = "";
  areaInput.value = "";
  bedroomsInput.value = "";
  bathroomsInput.value = "";
  furnishedInput.value = "";
  petsAllowedInput.value = "";
  sizeInput.value = "";
  floorInput.value = "";
  leaseTermInput.value = "";
  advanceDepositInput.value = "";
  priceInput.value = "";
  pricePreview.textContent = "Enter a price to see the formatted amount.";
  contactInput.value = "";
  contactHint.textContent = "";
  contactHint.className = "admin-field-hint";
  document.querySelectorAll('input[name="amenity"]').forEach((cb) => { cb.checked = false; });
  customAmenities.value = "";
  imageInputs.forEach(({ input }) => { if (input) input.value = ""; });
  renderImagePreviews();
}

// ── Load listings ────────────────────────────────────────────

async function loadListings() {
  const res = await fetch(`${API_BASE}/api/listings`);
  const listings = await res.json();
  adminListingsEl.innerHTML = "";
  if (!listings.length) {
    adminListingsEl.innerHTML = "<p>No listings yet.</p>";
    return;
  }
  listings.forEach((listing) => {
    const row = document.createElement("div");
    const imageCount = normalizeListingImages(listing).length;
    row.className = "card";
    row.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <img
          src="${escapeHTML(getPrimaryImageUrl(listing))}"
          style="width:120px; height:90px; object-fit:cover; border-radius:10px;"
          alt="${escapeHTML(listing.title || "Listing preview")}"
        />
        <div style="flex:1;">
          <strong>${escapeHTML(listing.title)}</strong><br/>
          <small>${escapeHTML(listing.location)} • ₱${escapeHTML(String(listing.price))}</small><br/>
          <small>${imageCount} photo${imageCount === 1 ? "" : "s"} saved</small>
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
      const action = button.dataset.action;
      const id = Number(button.dataset.id);
      if (action === "edit") await startEdit(id);
      else if (action === "delete") await deleteListing(id);
    });
  });

  adminListingsEl.querySelectorAll("input[data-action='verify']").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const id       = Number(checkbox.dataset.id);
      const verified = checkbox.checked;
      const label    = adminListingsEl.querySelector(`[data-verify-label="${id}"]`);
      try {
        const res = await fetch(`${API_BASE}/api/admin/listings/${id}/verify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  // Title
  titleInput.value = listing.title || "";
  titleCounter.textContent = `${titleInput.value.length}/80`;

  // Description
  descInput.value = listing.description || "";

  // Location: split at first ", "
  const locationStr = String(listing.location || "");
  const commaIdx = locationStr.indexOf(", ");
  if (commaIdx !== -1) {
    buildingInput.value = locationStr.slice(0, commaIdx);
    areaInput.value = locationStr.slice(commaIdx + 2);
  } else {
    buildingInput.value = locationStr;
    areaInput.value = "";
  }

  // Unit details
  bedroomsInput.value = listing.bedrooms || "";
  bathroomsInput.value = listing.bathrooms || "";
  furnishedInput.value = listing.furnished || "";
  petsAllowedInput.value = listing.petsAllowed || "";
  sizeInput.value = listing.sizesqm || "";
  floorInput.value = listing.floor || "";
  leaseTermInput.value = listing.leaseTerm || "";
  advanceDepositInput.value = listing.advanceDeposit || "";

  // Amenities: API now returns an array
  const amenityList = Array.isArray(listing.amenities) ? listing.amenities : [];
  document.querySelectorAll('input[name="amenity"]').forEach((cb) => {
    cb.checked = amenityList.includes(cb.value);
  });
  const customOnes = amenityList.filter((a) => !PRESET_AMENITIES.includes(a));
  customAmenities.value = customOnes.join(", ");

  // Price
  priceInput.value = listing.price || "";
  updatePricePreview(listing.price);

  // Contact
  contactInput.value = listing.contactNumber || "";
  contactHint.textContent = "";
  contactHint.className = "admin-field-hint";

  statusEl.textContent = `Editing listing ID ${id} (submit to save changes)`;
  statusEl.className = "status";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Delete listing ───────────────────────────────────────────

async function deleteListing(id) {
  if (!confirm(`Delete listing ID ${id}?`)) return;
  const res = await fetch(`${API_BASE}/api/listings/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Failed to delete");
    return;
  }
  await loadListings();
}

// ── Form submit ──────────────────────────────────────────────

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Validate contact before doing anything async
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
    const imageMap = new Map(currentListingImages.map((image) => [image.label, image.url]));
    uploadedImages.forEach((image) => imageMap.set(image.label, image.url));
    const images = IMAGE_LABELS
      .filter((label) => imageMap.has(label))
      .map((label) => ({ label, url: imageMap.get(label) }));
    const coverPhotoUrl = imageMap.get("cover photo") || images[0]?.url || null;

    const sizeRaw = sizeInput.value.trim();
    const floorRaw = floorInput.value.trim();

    const payload = {
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      location: collectLocation(),
      amenities: collectAmenities(),
      price: Number(priceInput.value.trim()),
      contactNumber: contactInput.value.trim(),
      bedrooms: bedroomsInput.value || null,
      bathrooms: bathroomsInput.value || null,
      furnished: furnishedInput.value || null,
      petsAllowed: petsAllowedInput.value || null,
      sizesqm: sizeRaw ? Number(sizeRaw) : null,
      floor: floorRaw ? Number(floorRaw) : null,
      leaseTerm: leaseTermInput.value || null,
      advanceDeposit: advanceDepositInput.value.trim() || null,
      imageUrl: coverPhotoUrl,
      images,
    };

    const url = editingId ? `${API_BASE}/api/listings/${editingId}` : `${API_BASE}/api/listings`;
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }

    const saved = await res.json();
    statusEl.textContent = editingId
      ? `Updated listing (ID: ${saved.id})`
      : `Listing added (ID: ${saved.id})`;
    statusEl.className = "status success";
    editingId = null;
    currentListingImages = [];
    resetForm();
    await loadListings();
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "status error";
  }
});

// ── Image event listeners ────────────────────────────────────

imageInputs.forEach(({ input }) => {
  input?.addEventListener("change", renderImagePreviews);
});

imageInputs.forEach(({ label, removeButton }) => {
  removeButton?.addEventListener("click", () => removeImageSlot(label));
});

// ── Landlord verification ────────────────────────────────────

const landlordsTableEl = document.getElementById("landlordsTable");

async function loadLandlords() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/landlords`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const landlords = await res.json();
    renderLandlordsTable(landlords);
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
          <th>Name</th>
          <th>Email</th>
          <th>Email verified</th>
          <th>Listings</th>
          <th>CoZi verified</th>
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
                <input
                  type="checkbox"
                  data-landlord-id="${l.id}"
                  ${l.isVerified ? "checked" : ""}
                />
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
      const id         = Number(checkbox.dataset.landlordId);
      const isVerified = checkbox.checked;
      const label      = checkbox.nextElementSibling;

      try {
        const res = await fetch(`${API_BASE}/api/admin/landlords/${id}/verify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
loadListings();
loadLandlords();
