const API_BASE = "http://localhost:3001";

const grid = document.getElementById("listingsGrid");
const statusEl = document.getElementById("listingsStatus");

const searchInput = document.getElementById("searchInput");
const minPriceInput = document.getElementById("minPrice");
const maxPriceInput = document.getElementById("maxPrice");

document.getElementById("searchBtn").addEventListener("click", loadListings);
document.getElementById("clearBtn").addEventListener("click", () => {
  searchInput.value = "";
  minPriceInput.value = "";
  maxPriceInput.value = "";
  loadListings();
});

// Enter key triggers search
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadListings();
});

function buildQuery() {
  const params = new URLSearchParams();

  const search = searchInput.value.trim();
  const minPrice = minPriceInput.value.trim();
  const maxPrice = maxPriceInput.value.trim();

  if (search) params.set("search", search);
  if (minPrice) params.set("minPrice", minPrice);
  if (maxPrice) params.set("maxPrice", maxPrice);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); }
  catch { return n; }
}

function cardHTML(listing) {
    const img = listing.imageUrl || "https://placehold.co/600x400";
    return `
      <div class="card">
        <img src="${img}" alt="Listing image"
             style="width:100%; height:150px; object-fit:cover; border-radius:10px;" />
        <h3 style="margin:10px 0 4px;">${listing.title}</h3>
        <p style="margin:0 0 6px;">${listing.location}</p>
        <p style="margin:0 0 10px;"><strong>₱${peso(listing.price)}</strong> / month</p>
  
       <a href="listing?id=${listing.id}" 
  style="display:inline-block; padding:12px; border-radius:10px; text-align:center; font-weight:600; background:#eee; text-decoration:none;"
>
  View Details
</a>
      </div>
    `;
  }

async function loadListings() {
  statusEl.textContent = "Loading listings...";
  statusEl.className = "status";
  grid.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/listings${buildQuery()}`);
    if (!res.ok) throw new Error("Failed to load listings");

    const listings = await res.json();

    if (!listings.length) {
      statusEl.textContent = "No listings found. Try a different search/filter.";
      return;
    }

    statusEl.textContent = `${listings.length} listing(s) found.`;
    grid.innerHTML = listings.map(cardHTML).join("");

    // attach click handlers
    grid.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-id]");
        if (!btn) return;
      
        const id = btn.getAttribute("data-id");
        window.location.href = `listing.html?id=${encodeURIComponent(id)}`;
      });
  } catch (err) {
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.className = "status error";
  }
}

loadListings();