const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;

const token = localStorage.getItem("cozi_landlord_token");
if (!token) window.location.href = "landlord-login.html";

const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const PRESET_AMENITIES = [
  "Aircon", "WiFi", "Parking", "Pool", "Gym", "Study Hall", "Function Hall",
  "CCTV", "Generator", "Elevator", "Washer/Dryer", "Water included", "Electric included",
];

const listingId = new URLSearchParams(window.location.search).get("id");
const isEditing = Boolean(listingId);

const form          = document.getElementById("listingForm");
const statusEl      = document.getElementById("status");
const submitBtn     = document.getElementById("submitBtn");
const pageHeading   = document.getElementById("pageHeading");

const titleInput         = document.getElementById("titleInput");
const titleCounter       = document.getElementById("titleCounter");
const descInput          = document.getElementById("descriptionInput");
const buildingInput      = document.getElementById("buildingName");
const areaInput          = document.getElementById("areaInput");
const bedroomsInput      = document.getElementById("bedroomsInput");
const bathroomsInput     = document.getElementById("bathroomsInput");
const furnishedInput     = document.getElementById("furnishedInput");
const petsAllowedInput   = document.getElementById("petsAllowedInput");
const sizeInput          = document.getElementById("sizeInput");
const floorInput         = document.getElementById("floorInput");
const leaseTermInput     = document.getElementById("leaseTermInput");
const advanceDepositInput = document.getElementById("advanceDepositInput");
const priceInput         = document.getElementById("priceInput");
const pricePreview       = document.getElementById("pricePreview");
const contactInput       = document.getElementById("contactInput");
const contactHint        = document.getElementById("contactHint");
const viberInput         = document.getElementById("viberInput");
const messengerInput     = document.getElementById("messengerInput");
const contactEmailInput  = document.getElementById("contactEmailInput");
const customAmenities    = document.getElementById("customAmenities");

const imageInputs = IMAGE_LABELS.map((label) => ({
  label,
  input: document.querySelector(`[data-image-label="${label}"]`),
  preview: document.querySelector(`[data-image-preview="${label}"]`),
  removeButton: document.querySelector(`[data-image-remove="${label}"]`),
}));

let currentListingImages = [];
const previewObjectUrls = new Map();

// ── Init ──────────────────────────────────────────────────────

if (isEditing) {
  pageHeading.textContent = "Edit Listing";
  submitBtn.textContent = "Save Changes";
  loadForEdit();
}

renderImagePreviews();

// ── Utilities ────────────────────────────────────────────────

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

function normalizeListingImages(listing) {
  const imageMap = new Map();
  const rawImages = Array.isArray(listing?.images) ? listing.images : [];
  rawImages.forEach((img) => {
    if (!img || typeof img !== "object") return;
    const label = String(img.label ?? "").trim().toLowerCase();
    const url   = String(img.url ?? "").trim();
    if (!IMAGE_LABELS.includes(label) || !url || imageMap.has(label)) return;
    imageMap.set(label, url);
  });
  const fallback = String(listing?.imageUrl ?? "").trim();
  if (!imageMap.size && fallback) imageMap.set("cover photo", fallback);
  return IMAGE_LABELS.filter((l) => imageMap.has(l)).map((l) => ({ label: l, url: imageMap.get(l) }));
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
  if (!val) { contactHint.textContent = ""; contactHint.className = "admin-field-hint"; return; }
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
  const url = previewObjectUrls.get(label);
  if (!url) return;
  URL.revokeObjectURL(url);
  previewObjectUrls.delete(label);
}

function renderImagePreviews() {
  const imageMap = new Map(
    normalizeListingImages({ images: currentListingImages }).map((img) => [img.label, img.url])
  );
  imageInputs.forEach(({ label, input, preview, removeButton }) => {
    if (!input || !preview) return;
    clearPreviewObjectUrl(label);
    const file = input.files?.[0];
    const existingUrl = imageMap.get(label);
    let previewUrl = existingUrl;
    let note = existingUrl ? "Current image will stay unless you replace it." : `No ${label} photo uploaded.`;
    if (file) {
      previewUrl = URL.createObjectURL(file);
      previewObjectUrls.set(label, previewUrl);
      note = `${file.name} is ready to upload.`;
    }
    if (!previewUrl) {
      preview.textContent = note;
      if (removeButton) removeButton.disabled = true;
      return;
    }
    const labelTitle = label.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    preview.innerHTML = `<img src="${escapeHTML(previewUrl)}" alt="${escapeHTML(labelTitle)}" /><span class="admin-image-slot__note">${escapeHTML(note)}</span>`;
    if (removeButton) removeButton.disabled = false;
  });
}

function removeImageSlot(label) {
  currentListingImages = currentListingImages.filter((img) => img.label !== label);
  const slot = imageInputs.find((s) => s.label === label);
  if (slot?.input) slot.input.value = "";
  renderImagePreviews();
}

async function uploadSingleImage(file) {
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

// ── Field helpers ────────────────────────────────────────────

function collectAmenities() {
  const checked = [...document.querySelectorAll('input[name="amenity"]:checked')].map((cb) => cb.value);
  const raw = customAmenities.value.trim();
  const custom = raw ? raw.split(",").map((a) => a.trim()).filter(Boolean) : [];
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

// ── Load for edit ────────────────────────────────────────────

async function loadForEdit() {
  statusEl.textContent = "Loading…";
  statusEl.className = "status";
  try {
    const res = await fetch(`${API_BASE}/api/listings/${listingId}`);
    if (!res.ok) throw new Error("Listing not found");
    const listing = await res.json();

    currentListingImages = normalizeListingImages(listing);
    imageInputs.forEach(({ input }) => { if (input) input.value = ""; });
    renderImagePreviews();

    titleInput.value = listing.title || "";
    titleCounter.textContent = `${titleInput.value.length}/80`;
    descInput.value = listing.description || "";

    const locationStr = String(listing.location || "");
    const commaIdx = locationStr.indexOf(", ");
    if (commaIdx !== -1) {
      buildingInput.value = locationStr.slice(0, commaIdx);
      areaInput.value = locationStr.slice(commaIdx + 2);
    } else {
      buildingInput.value = locationStr;
      areaInput.value = "";
    }

    bedroomsInput.value      = listing.bedrooms || "";
    bathroomsInput.value     = listing.bathrooms || "";
    furnishedInput.value     = listing.furnished || "";
    petsAllowedInput.value   = listing.petsAllowed || "";
    sizeInput.value          = listing.sizesqm || "";
    floorInput.value         = listing.floor || "";
    leaseTermInput.value     = listing.leaseTerm || "";
    advanceDepositInput.value = listing.advanceDeposit || "";

    const amenityList = Array.isArray(listing.amenities) ? listing.amenities : [];
    document.querySelectorAll('input[name="amenity"]').forEach((cb) => {
      cb.checked = amenityList.includes(cb.value);
    });
    customAmenities.value = amenityList.filter((a) => !PRESET_AMENITIES.includes(a)).join(", ");

    priceInput.value = listing.price || "";
    updatePricePreview(listing.price);

    contactInput.value      = listing.contactNumber || "";
    viberInput.value        = listing.viberNumber || "";
    messengerInput.value    = listing.messengerUrl || "";
    contactEmailInput.value = listing.contactEmail || "";

    statusEl.textContent = "";
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "status error";
  }
}

// ── Form submit ──────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validateContact()) {
    statusEl.textContent = "Phone number must start with 09 and be exactly 11 digits.";
    statusEl.className = "status error";
    contactInput.focus();
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = isEditing ? "Saving changes…" : "Publishing listing…";
  statusEl.className = "status";

  try {
    const uploaded = await uploadSelectedImages();
    const imageMap = new Map(currentListingImages.map((img) => [img.label, img.url]));
    uploaded.forEach((img) => imageMap.set(img.label, img.url));
    const images = IMAGE_LABELS.filter((l) => imageMap.has(l)).map((l) => ({ label: l, url: imageMap.get(l) }));
    const coverPhotoUrl = imageMap.get("cover photo") || images[0]?.url || null;

    const sizeRaw  = sizeInput.value.trim();
    const floorRaw = floorInput.value.trim();

    const payload = {
      title:          titleInput.value.trim(),
      description:    descInput.value.trim(),
      location:       collectLocation(),
      amenities:      collectAmenities(),
      price:          Number(priceInput.value.trim()),
      contactNumber:  contactInput.value.trim(),
      viberNumber:    viberInput.value.trim() || null,
      messengerUrl:   messengerInput.value.trim() || null,
      contactEmail:   contactEmailInput.value.trim() || null,
      bedrooms:       bedroomsInput.value || null,
      bathrooms:      bathroomsInput.value || null,
      furnished:      furnishedInput.value || null,
      petsAllowed:    petsAllowedInput.value || null,
      sizesqm:        sizeRaw ? Number(sizeRaw) : null,
      floor:          floorRaw ? Number(floorRaw) : null,
      leaseTerm:      leaseTermInput.value || null,
      advanceDeposit: advanceDepositInput.value.trim() || null,
      imageUrl:       coverPhotoUrl,
      images,
    };

    const url    = isEditing
      ? `${API_BASE}/api/landlord/listings/${listingId}`
      : `${API_BASE}/api/landlord/listings`;
    const method = isEditing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }

    window.location.href = "landlord-dashboard.html";
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "status error";
    submitBtn.disabled = false;
  }
});

// ── Image event listeners ────────────────────────────────────

imageInputs.forEach(({ input }) => {
  input?.addEventListener("change", renderImagePreviews);
});

imageInputs.forEach(({ label, removeButton }) => {
  removeButton?.addEventListener("click", () => removeImageSlot(label));
});
