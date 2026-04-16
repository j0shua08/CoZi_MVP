const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/900x680/f3f6f1/2f6b57?text=CoZi";

const grid = document.getElementById("listingsGrid");
const statusEl = document.getElementById("listingsStatus");
const searchForm = document.getElementById("searchForm");

const searchInput = document.getElementById("searchInput");
const minPriceInput = document.getElementById("minPrice");
const maxPriceInput = document.getElementById("maxPrice");

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loadListings();
});

document.getElementById("clearBtn").addEventListener("click", () => {
  searchInput.value = "";
  minPriceInput.value = "";
  maxPriceInput.value = "";
  loadListings();
});

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

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusEl.className = `status status-banner${tone === "error" ? " error" : ""}${tone === "success" ? " success" : ""}`;
}

function truncate(text, maxLength = 120) {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return "A comfortable condo listing with direct landlord contact and essentials ready to review.";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getAmenities(rawAmenities, limit = 3) {
  return String(rawAmenities ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function amenityTags(rawAmenities) {
  const amenities = getAmenities(rawAmenities);

  if (!amenities.length) {
    return '<li class="tag">Inquire for amenities</li>';
  }

  return amenities.map((item) => `<li class="tag">${escapeHTML(item)}</li>`).join("");
}

function loadingCards(count = 3) {
  return Array.from({ length: count }, () => `
    <article class="card loading-card">
      <div class="skeleton skeleton-image"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
        <div class="skeleton skeleton-line skeleton-line--lg"></div>
        <div class="skeleton skeleton-line skeleton-line--md"></div>
        <div class="skeleton skeleton-line skeleton-line--full"></div>
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
      </div>
    </article>
  `).join("");
}

function emptyStateHTML(title, copy) {
  return `
    <article class="card empty-state">
      <p class="eyebrow">No matches yet</p>
      <h3 class="empty-state__title">${escapeHTML(title)}</h3>
      <p class="empty-state__copy">${escapeHTML(copy)}</p>
    </article>
  `;
}

function detailHref(id) {
  return `listing?id=${encodeURIComponent(String(id))}`;
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

function cardHTML(listing) {
  const href = detailHref(listing.id);
  const title = escapeHTML(listing.title || "Untitled listing");
  const location = escapeHTML(listing.location || "Location unavailable");
  const imageUrl = escapeHTML(getPrimaryImageUrl(listing));
  const description = escapeHTML(truncate(listing.description));

  return `
    <article class="card listing-card">
      <a class="listing-card__media-link" href="${href}" aria-label="View details for ${title}">
        <img class="listing-card__image" src="${imageUrl}" alt="${title}" />
      </a>
      <div class="listing-card__body">
        <p class="listing-card__location">${location}</p>

        <div class="listing-card__header">
          <h3 class="listing-card__title">${title}</h3>
          <p class="listing-card__price">P${peso(listing.price)}<span>per month</span></p>
        </div>

        <p class="listing-card__description">${description}</p>

        <ul class="tag-list">
          ${amenityTags(listing.amenities)}
        </ul>

        <a class="listing-card__link" href="${href}">View details</a>
      </div>
    </article>
  `;
}

async function loadListings() {
  setStatus("Loading available listings...");
  grid.innerHTML = loadingCards();

  try {
    const res = await fetch(`${API_BASE}/api/listings${buildQuery()}`);
    if (!res.ok) throw new Error("Failed to load listings");

    const listings = await res.json();

    if (!listings.length) {
      setStatus("No listings matched the current search.");
      grid.innerHTML = emptyStateHTML(
        "No listings found",
        "Try a different area or widen your price range to see more homes."
      );
      return;
    }

    const label = listings.length === 1 ? "listing" : "listings";
    setStatus(`${listings.length} ${label} available right now.`);
    grid.innerHTML = listings.map(cardHTML).join("");
  } catch (err) {
    setStatus(`Unable to load listings: ${err.message}`, "error");
    grid.innerHTML = emptyStateHTML(
      "Listings are temporarily unavailable",
      "Please refresh the page or try again in a moment."
    );
  }
}

loadListings();
