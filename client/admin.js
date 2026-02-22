const API_BASE = "http://localhost:3001";
const token = localStorage.getItem("cozi_admin_token");
if (!token) window.location.href = "admin-login.html";

const form = document.getElementById("listingForm");
const statusEl = document.getElementById("status");
const adminListingsEl = document.getElementById("adminListings");

let editingId = null;

async function uploadImageIfAny() {
  const file = document.getElementById("imageFile")?.files?.[0];
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

async function loadListings() {
  const res = await fetch(`${API_BASE}/api/listings`);
  const listings = await res.json();

  adminListingsEl.innerHTML = "";

  if (!listings.length) {
    adminListingsEl.innerHTML = "<p>No listings yet.</p>";
    return;
  }

  listings.forEach((l) => {
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <img src="${l.imageUrl || "https://placehold.co/120x90"}"
             style="width:120px; height:90px; object-fit:cover; border-radius:10px;" />
        <div style="flex:1;">
          <strong>${l.title}</strong><br/>
          <small>${l.location} • ₱${l.price}</small>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button data-action="edit" data-id="${l.id}">Edit</button>
            <button data-action="delete" data-id="${l.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
    adminListingsEl.appendChild(row);
  });

  adminListingsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);

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
  const l = await res.json();

  editingId = id;

  // Save current image URL in hidden input (so we can keep it if no new upload)
  const hiddenImageUrl = document.getElementById("imageUrl");
  if (hiddenImageUrl) hiddenImageUrl.value = l.imageUrl || "";

  // Clear file input (browser won't allow prefill)
  const fileInput = document.getElementById("imageFile");
  if (fileInput) fileInput.value = "";

  // Fill form fields by name
  form.title.value = l.title;
  form.description.value = l.description;
  form.location.value = l.location;
  form.amenities.value = l.amenities;
  form.price.value = l.price;
  form.contactNumber.value = l.contactNumber;

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = editingId ? "Updating..." : "Saving...";
  statusEl.className = "status";

  try {
    const formData = new FormData(form);

    // 1) Upload new image if selected
    const uploadedUrl = await uploadImageIfAny();

    // 2) Keep existing image URL when editing
    const existingUrl = document.getElementById("imageUrl")?.value || null;

    // 3) Build payload after imageUrl resolved
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      location: formData.get("location"),
      amenities: formData.get("amenities"),
      price: Number(formData.get("price")),
      contactNumber: formData.get("contactNumber"),
      imageUrl: uploadedUrl || existingUrl,
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
      ? `✅ Updated listing (ID: ${saved.id})`
      : `✅ Listing added (ID: ${saved.id})`;

    statusEl.className = "status success";
    editingId = null;
    form.reset();

    // Reset hidden imageUrl after save
    const hiddenImageUrl = document.getElementById("imageUrl");
    if (hiddenImageUrl) hiddenImageUrl.value = "";

    await loadListings();
  } catch (err) {
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.className = "status error";
  }
});

// initial load
loadListings();