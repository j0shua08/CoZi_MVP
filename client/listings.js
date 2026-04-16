const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/900x680/f3f6f1/2f6b57?text=CoZi";
const MAX_COMPARE = 3;

// ── DOM refs ────────────────────────────────────────────────

const grid      = document.getElementById("listingsGrid");
const statusEl  = document.getElementById("listingsStatus");
const searchForm = document.getElementById("searchForm");
const searchInput  = document.getElementById("searchInput");
const minPriceInput = document.getElementById("minPrice");
const maxPriceInput = document.getElementById("maxPrice");

// Compare bar
const compareBar      = document.getElementById("compareBar");
const compareSlots    = document.getElementById("compareSlots");
const compareOpenBtn  = document.getElementById("compareOpenBtn");
const compareClearBtn = document.getElementById("compareClearBtn");

// Compare modal
const compareModal = document.getElementById("compareModal");
const compareTable = document.getElementById("compareTable");

// ── State ───────────────────────────────────────────────────

let allListings  = [];   // full API results from latest fetch
let compareItems = [];   // array of listing objects, max MAX_COMPARE

// ── Search form ─────────────────────────────────────────────

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

// ── Utilities ───────────────────────────────────────────────

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function buildQuery() {
  const params = new URLSearchParams();
  const search   = searchInput.value.trim();
  const minPrice = minPriceInput.value.trim();
  const maxPrice = maxPriceInput.value.trim();
  if (search)    params.set("search", search);
  if (minPrice)  params.set("minPrice", minPrice);
  if (maxPrice)  params.set("maxPrice", maxPrice);
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
  if (!normalized) return "A comfortable condo listing with direct landlord contact and essentials ready to review.";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getAmenities(rawAmenities, limit = 3) {
  return String(rawAmenities ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function amenityTags(rawAmenities, limit = 3) {
  const amenities = getAmenities(rawAmenities, limit);
  if (!amenities.length) return '<li class="tag">Inquire for amenities</li>';
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
    const url   = String(image.url ?? "").trim();
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

// ── Card template ────────────────────────────────────────────

function cardHTML(listing) {
  const href        = detailHref(listing.id);
  const title       = escapeHTML(listing.title || "Untitled listing");
  const location    = escapeHTML(listing.location || "Location unavailable");
  const imageUrl    = escapeHTML(getPrimaryImageUrl(listing));
  const description = escapeHTML(truncate(listing.description));
  const id          = escapeHTML(String(listing.id));
  const inCompare   = isCompared(listing.id);
  const maxReached  = !inCompare && compareItems.length >= MAX_COMPARE;

  return `
    <article class="card listing-card${inCompare ? " is-comparing" : ""}" data-listing-id="${id}">
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

        <div class="listing-card__footer">
          <a class="listing-card__link" href="${href}">View details</a>
          <button
            type="button"
            class="compare-toggle-btn${inCompare ? " compare-toggle-btn--active" : ""}"
            data-compare-id="${id}"
            aria-pressed="${inCompare ? "true" : "false"}"
            ${maxReached ? "disabled" : ""}
          >${inCompare ? "&#10003; Added" : "Compare"}</button>
        </div>
      </div>
    </article>
  `;
}

// ── Compare state ────────────────────────────────────────────

function isCompared(id) {
  return compareItems.some((l) => String(l.id) === String(id));
}

function addToCompare(id) {
  if (compareItems.length >= MAX_COMPARE) return;
  const listing = allListings.find((l) => String(l.id) === String(id));
  if (!listing || isCompared(id)) return;
  compareItems.push(listing);
  renderCompareBar();
}

function removeFromCompare(id) {
  compareItems = compareItems.filter((l) => String(l.id) !== String(id));
  renderCompareBar();
}

function toggleCompare(id) {
  isCompared(id) ? removeFromCompare(id) : addToCompare(id);
}

function clearCompare() {
  compareItems = [];
  renderCompareBar();
  closeCompareModal();
}

// ── Compare bar rendering ────────────────────────────────────

function renderCompareBar() {
  const count = compareItems.length;

  // Show / hide bar
  compareBar.classList.toggle("compare-bar--visible", count > 0);

  // Slots
  compareSlots.innerHTML = compareItems.map((l) => {
    const img   = escapeHTML(getPrimaryImageUrl(l));
    const title = escapeHTML(l.title || "Listing");
    const id    = escapeHTML(String(l.id));
    return `
      <div class="compare-bar__slot">
        <img class="compare-bar__thumb" src="${img}" alt="${title}" />
        <span class="compare-bar__slot-name">${escapeHTML(truncate(l.title, 28))}</span>
        <button
          type="button"
          class="compare-bar__remove"
          data-compare-remove="${id}"
          aria-label="Remove ${title} from comparison"
        >&#10005;</button>
      </div>
    `;
  }).join("");

  // Button label with proper pluralization
  const listingWord = count === 1 ? "listing" : "listings";
  compareOpenBtn.textContent = `Compare ${count} ${listingWord}`;

  // Disabled when fewer than 2 selected
  compareOpenBtn.disabled = count < 2;

  // Sync card-level buttons
  renderCompareButtons();
}

function renderCompareButtons() {
  document.querySelectorAll(".compare-toggle-btn").forEach((btn) => {
    const id = btn.dataset.compareId;
    const inCompare  = isCompared(id);
    const maxReached = !inCompare && compareItems.length >= MAX_COMPARE;

    btn.classList.toggle("compare-toggle-btn--active", inCompare);
    btn.setAttribute("aria-pressed", String(inCompare));
    btn.disabled = maxReached;
    btn.innerHTML = inCompare ? "&#10003; Added" : "Compare";
  });

  // Highlight cards in compare
  document.querySelectorAll(".listing-card[data-listing-id]").forEach((card) => {
    card.classList.toggle("is-comparing", isCompared(card.dataset.listingId));
  });
}

// ── Compare modal ────────────────────────────────────────────

function compareModalTableHTML() {
  const n = compareItems.length;

  const headers = compareItems.map((l) => {
    const img      = escapeHTML(getPrimaryImageUrl(l));
    const title    = escapeHTML(l.title || "Untitled");
    const location = escapeHTML(l.location || "");
    const id       = escapeHTML(String(l.id));
    return `
      <div class="compare-col-header">
        <div class="compare-col-header__media">
          <img class="compare-col-header__image" src="${img}" alt="${title}" />
          <button
            type="button"
            class="compare-col-header__remove"
            data-compare-remove="${id}"
            aria-label="Remove ${title} from comparison"
          >&#10005;</button>
        </div>
        <div class="compare-col-header__info">
          <h3 class="compare-col-header__title">${title}</h3>
          <p class="compare-col-header__location">${location}</p>
          <p class="compare-col-header__price">P${peso(l.price)}<span>/month</span></p>
        </div>
      </div>
    `;
  }).join("");

  function section(label, cellFn) {
    const cells = compareItems.map((l) => `
      <div class="compare-section__cell">${cellFn(l)}</div>
    `).join("");
    return `
      <div class="compare-section">
        <div class="compare-section__label">${escapeHTML(label)}</div>
        <div class="compare-section__row">${cells}</div>
      </div>
    `;
  }

  const amenitiesSection = section("Amenities", (l) => {
    const amenities = getAmenities(l.amenities, 10);
    if (!amenities.length) return '<span class="compare-empty">None listed</span>';
    return `<ul class="tag-list">${amenities.map((a) => `<li class="tag">${escapeHTML(a)}</li>`).join("")}</ul>`;
  });

  const descSection = section("Description", (l) => {
    const desc = String(l.description ?? "").trim();
    return desc
      ? `<p class="compare-desc">${escapeHTML(truncate(desc, 160))}</p>`
      : '<span class="compare-empty">No description available.</span>';
  });

  const detailsSection = section("Full listing", (l) => `
    <a class="button-link button-link--full" href="${detailHref(l.id)}">View details</a>
  `);

  return `
    <div class="compare-modal__table-inner" style="--compare-cols:${n}">
      <div class="compare-header-row">${headers}</div>
      ${amenitiesSection}
      ${descSection}
      ${detailsSection}
    </div>
  `;
}

function openCompareModal() {
  if (compareItems.length < 2) return;
  compareTable.innerHTML = compareModalTableHTML();
  compareModal.hidden = false;
  document.body.classList.add("compare-modal-open");
  compareModal.querySelector(".compare-modal__close").focus();
}

function closeCompareModal() {
  compareModal.hidden = true;
  document.body.classList.remove("compare-modal-open");
}

// ── Event delegation ─────────────────────────────────────────

// Grid: compare toggle buttons
grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-compare-id]");
  if (btn) toggleCompare(btn.dataset.compareId);
});

// Compare bar
compareBar.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-compare-remove]");
  if (removeBtn) { removeFromCompare(removeBtn.dataset.compareRemove); return; }
  if (e.target.closest("#compareOpenBtn")) { openCompareModal(); return; }
  if (e.target.closest("#compareClearBtn")) { clearCompare(); return; }
});

// Compare modal
compareModal.addEventListener("click", (e) => {
  if (e.target.closest("[data-compare-close]")) { closeCompareModal(); return; }

  const removeBtn = e.target.closest("[data-compare-remove]");
  if (removeBtn) {
    removeFromCompare(removeBtn.dataset.compareRemove);
    if (compareItems.length < 2) {
      closeCompareModal();
    } else {
      compareTable.innerHTML = compareModalTableHTML();
    }
  }
});

// Keyboard: close modal on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !compareModal.hidden) closeCompareModal();
});

// ── Load listings ────────────────────────────────────────────

async function loadListings() {
  setStatus("Loading available listings...");
  grid.innerHTML = loadingCards();

  try {
    const res = await fetch(`${API_BASE}/api/listings${buildQuery()}`);
    if (!res.ok) throw new Error("Failed to load listings");

    const listings = await res.json();
    allListings = listings; // store for compare lookups

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
    renderCompareButtons(); // sync compare state after grid re-render
  } catch (err) {
    setStatus(`Unable to load listings: ${err.message}`, "error");
    grid.innerHTML = emptyStateHTML(
      "Listings are temporarily unavailable",
      "Please refresh the page or try again in a moment."
    );
  }
}

loadListings();
