const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/900x680/f3f6f1/2f6b57?text=CoZi";

const featuredGrid = document.getElementById("featuredGrid");
const featuredStatus = document.getElementById("featuredStatus");

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

function truncate(text, maxLength = 120) {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return "A student-friendly condo listing with clear details and direct landlord contact.";
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
    return '<li class="tag">Ask for amenities</li>';
  }

  return amenities.map((item) => `<li class="tag">${escapeHTML(item)}</li>`).join("");
}

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); }
  catch { return n; }
}

function setStatus(message, tone = "neutral") {
  featuredStatus.textContent = message;
  featuredStatus.className = `status status-banner${tone === "error" ? " error" : ""}${tone === "success" ? " success" : ""}`;
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
      <p class="eyebrow">Featured units</p>
      <h3 class="empty-state__title">${escapeHTML(title)}</h3>
      <p class="empty-state__copy">${escapeHTML(copy)}</p>
      <a class="text-link" href="listings.html">Browse all listings</a>
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

async function loadFeaturedListings() {
  setStatus("Loading featured units...");
  featuredGrid.innerHTML = loadingCards();

  try {
    const res = await fetch(`${API_BASE}/api/listings`);
    if (!res.ok) throw new Error("Failed to load featured units");

    const listings = await res.json();
    const featured = listings.slice(0, 3);

    if (!featured.length) {
      setStatus("No featured units available yet.");
      featuredGrid.innerHTML = emptyStateHTML(
        "Featured units are coming soon",
        "Check back after listings are added, or open the full listings page later."
      );
      return;
    }

    setStatus("Featured units pulled from the latest available listings.");
    featuredGrid.innerHTML = featured.map(cardHTML).join("");
  } catch (err) {
    setStatus(`Unable to load featured units: ${err.message}`, "error");
    featuredGrid.innerHTML = emptyStateHTML(
      "Featured units are unavailable",
      "Please try again in a moment or browse the listings page directly."
    );
  }
}

loadFeaturedListings();
