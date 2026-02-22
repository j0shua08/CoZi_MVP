const API_BASE = "http://localhost:3001";

const statusEl = document.getElementById("detailStatus");
const cardEl = document.getElementById("detailCard");

const params = new URLSearchParams(window.location.search);
const id = params.get("id");

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); }
  catch { return n; }
}

async function loadDetail() {
  if (!id) {
    statusEl.textContent = "❌ No listing ID provided.";
    statusEl.className = "status error";
    return;
  }

  statusEl.textContent = "Loading details...";
  statusEl.className = "status";
  cardEl.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}`);
    if (res.status === 404) throw new Error("Listing not found");
    if (!res.ok) throw new Error("Failed to load listing");

    const l = await res.json();
    const img = l.imageUrl || "https://placehold.co/600x400";

    statusEl.textContent = "";
    cardEl.innerHTML = `
      <div class="card">
        <img src="${img}" alt="Listing image" style="width:100%; max-height:340px; object-fit:cover; border-radius:10px;" />
        <h2 style="margin:12px 0 6px;">${l.title}</h2>
        <p style="margin:0 0 6px;"><strong>Location:</strong> ${l.location}</p>
        <p style="margin:0 0 6px;"><strong>Price:</strong> ₱${peso(l.price)} / month</p>
        <p style="margin:0 0 10px;"><strong>Amenities:</strong> ${l.amenities}</p>

        <p style="margin:0 0 6px;"><strong>Description:</strong></p>
        <p style="margin:0 0 14px;">${l.description}</p>

        <hr />

        <p style="margin:12px 0 6px;"><strong>Contact Landlord:</strong></p>
        <p style="margin:0 0 12px;">${l.contactNumber}</p>
      </div>
    `;
  } catch (err) {
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.className = "status error";
  }
}

loadDetail();