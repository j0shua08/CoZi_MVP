const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const token = localStorage.getItem("cozi_admin_token");
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/120x90/f5ecdf/6d5a4a?text=CoZi";

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

let editingId = null;
let currentListingImages = [];
const previewObjectUrls = new Map();

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };

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
  if (!imageMap.size && fallbackUrl) {
    imageMap.set("cover photo", fallbackUrl);
  }

  return IMAGE_LABELS
    .filter((label) => imageMap.has(label))
    .map((label) => ({ label, url: imageMap.get(label) }));
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
  if (imageSlot?.input) {
    imageSlot.input.value = "";
  }

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
          <small>${escapeHTML(listing.location)} • ₱${escapeHTML(listing.price)}</small><br/>
          <small>${imageCount} photo${imageCount === 1 ? "" : "s"} saved</small>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button data-action="edit" data-id="${listing.id}">Edit</button>
            <button data-action="delete" data-id="${listing.id}">Delete</button>
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

      if (action === "edit") {
        await startEdit(id);
      } else if (action === "delete") {
        await deleteListing(id);
      }
    });
  });
}

async function startEdit(id) {
  const res = await fetch(`${API_BASE}/api/listings/${id}`);
  const listing = await res.json();

  editingId = id;
  currentListingImages = normalizeListingImages(listing);

  imageInputs.forEach(({ input }) => {
    if (input) input.value = "";
  });
  renderImagePreviews();

  form.title.value = listing.title;
  form.description.value = listing.description;
  form.location.value = listing.location;
  form.amenities.value = listing.amenities;
  form.price.value = listing.price;
  form.contactNumber.value = listing.contactNumber;

  statusEl.textContent = `Editing listing ID ${id} (submit to save changes)`;
  statusEl.className = "status";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = editingId ? "Updating..." : "Saving...";
  statusEl.className = "status";

  try {
    const formData = new FormData(form);
    const uploadedImages = await uploadSelectedImages();
    const imageMap = new Map(currentListingImages.map((image) => [image.label, image.url]));

    uploadedImages.forEach((image) => imageMap.set(image.label, image.url));

    const images = IMAGE_LABELS
      .filter((label) => imageMap.has(label))
      .map((label) => ({ label, url: imageMap.get(label) }));
    const coverPhotoUrl = imageMap.get("cover photo") || images[0]?.url || null;

    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      location: formData.get("location"),
      amenities: formData.get("amenities"),
      price: Number(formData.get("price")),
      contactNumber: formData.get("contactNumber"),
      imageUrl: coverPhotoUrl,
      images,
    };

    const url = editingId
      ? `${API_BASE}/api/listings/${editingId}`
      : `${API_BASE}/api/listings`;
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
    form.reset();
    renderImagePreviews();

    await loadListings();
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "status error";
  }
});

imageInputs.forEach(({ input }) => {
  input?.addEventListener("change", renderImagePreviews);
});

imageInputs.forEach(({ label, removeButton }) => {
  removeButton?.addEventListener("click", () => {
    removeImageSlot(label);
  });
});

renderImagePreviews();
loadListings();
