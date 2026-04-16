const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001"
  : window.location.origin;
const IMAGE_LABELS = ["bedroom", "bathroom", "kitchen", "living room", "cover photo"];
const IMAGE_PLACEHOLDER = "https://placehold.co/1200x800/f3f6f1/2f6b57?text=CoZi";
const MAX_COMPARE_EXTRAS = 2; // max listings to add besides the current one

// ── DOM refs ─────────────────────────────────────────────────

const statusEl = document.getElementById("detailStatus");
const cardEl   = document.getElementById("detailCard");

// Selector modal
const selectorModal  = document.getElementById("selectorModal");
const selectorGrid   = document.getElementById("selectorGrid");
const selectorFooter = document.getElementById("selectorFooter");
const selectorSub    = document.getElementById("selectorSub");
const compareNowBtn  = document.getElementById("compareNowBtn");

// Compare modal
const compareModal   = document.getElementById("compareModal");
const compareTableEl = document.getElementById("compareTable");

// ── Lightbox state ───────────────────────────────────────────

let detailImages      = [];
let activeLightboxIndex = -1;
let lightboxReadyAt   = 0;

// ── Compare state ────────────────────────────────────────────

let currentListing    = null;   // the listing currently being viewed
let selectorListings  = [];     // all other listings fetched for selection
const selectedForCompare = new Set(); // IDs of listings chosen in the selector

// ── Utilities ────────────────────────────────────────────────

function getListingId() {
  const params = new URLSearchParams(window.location.search);
  const queryId = params.get("id");
  if (queryId) return queryId;

  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const hashId = hashParams.get("id");
    if (hashId) return hashId;
  }

  const segments = window.location.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const lastSegment = segments[segments.length - 1] || "";
  if (/^\d+$/.test(lastSegment)) return lastSegment;

  return "";
}

const id = getListingId();

function peso(n) {
  try { return new Intl.NumberFormat("en-PH").format(n); }
  catch { return n; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function truncate(text, maxLength = 120) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function titleCaseLabel(label) {
  return String(label ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusEl.className = `status status-banner${tone === "error" ? " error" : ""}${tone === "success" ? " success" : ""}`;
}

function getAmenities(rawAmenities, limit = 10) {
  return String(rawAmenities ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function amenityTags(rawAmenities) {
  const amenities = getAmenities(rawAmenities);
  if (!amenities.length) return '<li class="tag">Ask landlord for amenities</li>';
  return amenities.map((item) => `<li class="tag">${escapeHTML(item)}</li>`).join("");
}

function buildTelHref(phone) {
  const normalized = String(phone ?? "").replace(/[^+\d]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function detailHref(listingId) {
  return `listing?id=${encodeURIComponent(String(listingId))}`;
}

// ── Image helpers ─────────────────────────────────────────────

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

  return IMAGE_LABELS
    .filter((label) => imageMap.has(label))
    .map((label) => ({ label, url: imageMap.get(label) }));
}

function getPrimaryImage(listing) {
  const images = normalizeListingImages(listing);
  return (
    images.find((image) => image.label === "cover photo") ||
    images[0] ||
    { label: "cover photo", url: String(listing?.imageUrl ?? "").trim() || IMAGE_PLACEHOLDER }
  );
}

function getPrimaryImageUrl(listing) {
  return getPrimaryImage(listing).url;
}

function buildDetailImages(listing) {
  const images = normalizeListingImages(listing);
  const primaryImage = getPrimaryImage(listing);
  const secondaryImages = images.filter((image) => image.label !== primaryImage.label);
  return { primaryImage, images: [primaryImage, ...secondaryImages] };
}

// ── Lightbox HTML ─────────────────────────────────────────────

function lightboxHTML() {
  return `
    <div class="lightbox" data-lightbox hidden>
      <div class="lightbox__backdrop" data-lightbox-close></div>
      <section class="lightbox__dialog" role="dialog" aria-modal="true" aria-label="Enlarged listing photo">
        <div class="lightbox__toolbar">
          <p class="lightbox__caption" data-lightbox-caption></p>
          <button type="button" class="lightbox__close" data-lightbox-close aria-label="Close enlarged photo">Close</button>
        </div>
        <div class="lightbox__stage">
          <button type="button" class="lightbox__nav lightbox__nav--prev" data-lightbox-prev aria-label="View previous photo">‹</button>
          <img class="lightbox__image" data-lightbox-image src="" alt="" />
          <button type="button" class="lightbox__nav lightbox__nav--next" data-lightbox-next aria-label="View next photo">›</button>
        </div>
      </section>
    </div>
  `;
}

// ── Detail page HTML ──────────────────────────────────────────

function photoTourHTML(title, images) {
  const galleryImages = images.slice(1);
  if (!galleryImages.length) return "";

  return `
    <section class="detail-card__section">
      <div>
        <p class="section-label">Photo tour</p>
        <h2>See more parts of the space.</h2>
      </div>
      <div class="detail-gallery">
        ${galleryImages.map((image) => `
          <figure class="detail-gallery__item">
            <button
              type="button"
              class="detail-gallery__button"
              data-zoom-index="${images.findIndex((galleryImage) => galleryImage.label === image.label)}"
              aria-label="Enlarge ${escapeHTML(titleCaseLabel(image.label))} photo"
            >
              <img
                class="detail-gallery__image"
                src="${escapeHTML(image.url)}"
                alt="${escapeHTML(`${title} ${titleCaseLabel(image.label)}`)}"
              />
            </button>
            <figcaption class="detail-gallery__caption">${escapeHTML(titleCaseLabel(image.label))}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function loadingStateHTML() {
  return `
    <article class="detail-layout">
      <section class="card detail-card loading-card">
        <div class="skeleton skeleton-image skeleton-image--detail"></div>
        <div class="detail-card__body">
          <div class="skeleton skeleton-line skeleton-line--sm"></div>
          <div class="skeleton skeleton-line skeleton-line--lg"></div>
          <div class="skeleton skeleton-line skeleton-line--md"></div>
          <div class="skeleton skeleton-line skeleton-line--full"></div>
          <div class="skeleton skeleton-line skeleton-line--full"></div>
        </div>
      </section>
      <aside class="detail-aside">
        <div class="card detail-aside__card">
          <div class="skeleton skeleton-line skeleton-line--sm"></div>
          <div class="skeleton skeleton-line skeleton-line--lg"></div>
          <div class="skeleton skeleton-line skeleton-line--full"></div>
          <div class="skeleton skeleton-line skeleton-line--md"></div>
        </div>
        <div class="card detail-aside__card">
          <div class="skeleton skeleton-line skeleton-line--sm"></div>
          <div class="skeleton skeleton-line skeleton-line--lg"></div>
          <div class="skeleton skeleton-line skeleton-line--full"></div>
        </div>
      </aside>
    </article>
  `;
}

function messageStateHTML(title, copy) {
  return `
    <article class="card empty-state">
      <p class="eyebrow">Listing status</p>
      <h2 class="empty-state__title">${escapeHTML(title)}</h2>
      <p class="empty-state__copy">${escapeHTML(copy)}</p>
      <a class="button-link button-link--ghost" href="listings.html">Return to listings</a>
    </article>
  `;
}

function detailHTML(listing) {
  const title         = escapeHTML(listing.title || "Untitled listing");
  const location      = escapeHTML(listing.location || "Location unavailable");
  const description   = escapeHTML(
    listing.description || "Reach out to the landlord for more context on the home, availability, and move-in timing."
  );
  const contactNumber = escapeHTML(listing.contactNumber || "Contact number unavailable");
  const telHref       = buildTelHref(listing.contactNumber);
  const gallery       = buildDetailImages(listing);
  const { images, primaryImage } = gallery;
  const imageUrl      = escapeHTML(primaryImage.url);
  const heroEyebrow   = escapeHTML(
    primaryImage.label ? `Available listing • ${titleCaseLabel(primaryImage.label)}` : "Available listing"
  );
  const photoCount    = images.length || (String(listing.imageUrl ?? "").trim() ? 1 : 0);

  return `
    <article class="detail-layout">
      <section class="card detail-card">
        <div class="detail-card__media">
          <button
            type="button"
            class="detail-card__media-button"
            data-zoom-index="0"
            aria-label="Enlarge main listing photo"
          >
            <img class="detail-card__image" src="${imageUrl}" alt="${title}" />
            <div class="detail-card__overlay">
              <p class="eyebrow eyebrow--inverted">${heroEyebrow}</p>
              <h2 class="detail-title">${title}</h2>
              <p class="detail-card__location">${location}</p>
            </div>
          </button>
        </div>

        <div class="detail-card__body">
          <div class="detail-card__headline">
            <div>
              <p class="section-label">Monthly rate</p>
              <p class="detail-card__price">P${peso(listing.price)} <span>/ month</span></p>
            </div>
            <ul class="tag-list">
              ${amenityTags(listing.amenities)}
            </ul>
          </div>

          <section class="detail-card__section">
            <h2>About this listing</h2>
            <p>${description}</p>
          </section>

          ${photoTourHTML(title, images)}
        </div>
      </section>

      <aside class="detail-aside">
        <section class="card detail-aside__card">
          <div>
            <p class="eyebrow">Quick facts</p>
            <h2>Everything important at a glance.</h2>
          </div>
          <ul class="fact-list">
            <li class="fact-row">
              <span class="fact-label">Location</span>
              <span class="fact-value">${location}</span>
            </li>
            <li class="fact-row">
              <span class="fact-label">Rate</span>
              <span class="fact-value">P${peso(listing.price)} / month</span>
            </li>
            <li class="fact-row">
              <span class="fact-label">Contact</span>
              <span class="fact-value">${contactNumber}</span>
            </li>
            <li class="fact-row">
              <span class="fact-label">Photos</span>
              <span class="fact-value">${escapeHTML(photoCount)}</span>
            </li>
            <li class="fact-row">
              <span class="fact-label">Reference</span>
              <span class="fact-value">#${escapeHTML(listing.id)}</span>
            </li>
          </ul>
        </section>

        <section class="card detail-aside__card contact-card">
          <div>
            <p class="eyebrow">Contact landlord</p>
            <h2>Reach out when this home feels right.</h2>
          </div>
          <p class="contact-number">${contactNumber}</p>
          <p class="contact-note">
            Use the number above to confirm availability, schedule a viewing, and ask any move-in questions.
          </p>
          ${telHref ? `<a class="button-link button-link--full" href="${escapeHTML(telHref)}">Call Landlord</a>` : ""}
        </section>

        <section class="card detail-aside__card">
          <div>
            <p class="eyebrow">Compare</p>
            <h2>How does this compare?</h2>
          </div>
          <p class="contact-note">Pick another listing to compare price, location, and amenities side by side.</p>
          <button
            type="button"
            class="button-link button-link--ghost button-link--full"
            data-open-compare-selector
          >
            Compare with other listings
          </button>
        </section>
      </aside>
    </article>

    ${lightboxHTML()}
  `;
}

// ── Selector modal ────────────────────────────────────────────

async function openSelector() {
  if (!currentListing) return;

  // Reset selections
  selectedForCompare.clear();
  selectorFooter.hidden = true;

  selectorModal.hidden = false;
  document.body.classList.add("compare-modal-open");
  selectorGrid.innerHTML = `<p class="compare-empty" style="padding:var(--space-5)">Loading listings…</p>`;

  try {
    const res = await fetch(`${API_BASE}/api/listings`);
    if (!res.ok) throw new Error("Failed to load");
    selectorListings = (await res.json()).filter((l) => String(l.id) !== String(currentListing.id));
    renderSelectorGrid();
    selectorModal.querySelector(".selector-modal__close")?.focus();
  } catch {
    selectorGrid.innerHTML = `<p class="status error" style="padding:var(--space-5)">Could not load listings. Please try again.</p>`;
  }
}

function closeSelector() {
  selectorModal.hidden = true;
  document.body.classList.remove("compare-modal-open");
}

function renderSelectorGrid() {
  if (!selectorListings.length) {
    selectorGrid.innerHTML = `<p class="compare-empty" style="padding:var(--space-5)">No other listings available to compare.</p>`;
    return;
  }

  const count    = selectedForCompare.size;
  const maxReached = count >= MAX_COMPARE_EXTRAS;

  selectorGrid.innerHTML = selectorListings.map((l) => {
    const lid       = escapeHTML(String(l.id));
    const img       = escapeHTML(getPrimaryImageUrl(l));
    const title     = escapeHTML(l.title || "Untitled");
    const location  = escapeHTML(l.location || "");
    const isSelected = selectedForCompare.has(String(l.id));
    const disabled   = !isSelected && maxReached;

    return `
      <div class="selector-card${isSelected ? " is-selected" : ""}">
        <img class="selector-card__image" src="${img}" alt="${title}" />
        <div class="selector-card__info">
          <p class="selector-card__title">${title}</p>
          <p class="selector-card__sub">${location}${location && l.price ? " · " : ""}${l.price ? `P${peso(l.price)}/mo` : ""}</p>
        </div>
        <button
          type="button"
          class="selector-card__btn${isSelected ? " selector-card__btn--active" : ""}"
          data-toggle-id="${lid}"
          ${disabled ? "disabled" : ""}
          aria-pressed="${isSelected ? "true" : "false"}"
        >${isSelected ? "&#10003; Selected" : "Select"}</button>
      </div>
    `;
  }).join("");

  // Update sub-label
  const remaining = MAX_COMPARE_EXTRAS - count;
  selectorSub.textContent = count === 0
    ? `Select up to ${MAX_COMPARE_EXTRAS} listings to compare`
    : remaining === 0
      ? `${count} selected — ready to compare`
      : `${count} selected · ${remaining} more allowed`;

  // Show/hide footer
  selectorFooter.hidden = count === 0;
  if (count > 0) {
    const total = count + 1; // +1 for current listing
    compareNowBtn.textContent = `Compare ${total} listings`;
  }
}

function toggleSelectorItem(lid) {
  if (selectedForCompare.has(lid)) {
    selectedForCompare.delete(lid);
  } else {
    if (selectedForCompare.size >= MAX_COMPARE_EXTRAS) return;
    selectedForCompare.add(lid);
  }
  renderSelectorGrid();
}

// ── Compare modal (detail page) ───────────────────────────────

function compareColHeaderHTML(l, showRemove = false) {
  const img      = escapeHTML(getPrimaryImageUrl(l));
  const title    = escapeHTML(l.title || "Untitled");
  const location = escapeHTML(l.location || "");
  const lid      = escapeHTML(String(l.id));

  return `
    <div class="compare-col-header">
      <div class="compare-col-header__media">
        <img class="compare-col-header__image" src="${img}" alt="${title}" />
      </div>
      <div class="compare-col-header__info">
        <h3 class="compare-col-header__title">${title}</h3>
        <p class="compare-col-header__location">${location}</p>
        <p class="compare-col-header__price">P${peso(l.price)}<span>/month</span></p>
      </div>
    </div>
  `;
}

function compareModalTableHTML(listings) {
  const n = listings.length;

  const headers = listings.map((l) => compareColHeaderHTML(l)).join("");

  function section(label, cellFn) {
    const cells = listings.map((l) => `
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
    const tags = getAmenities(l.amenities, 10);
    if (!tags.length) return '<span class="compare-empty">None listed</span>';
    return `<ul class="tag-list">${tags.map((a) => `<li class="tag">${escapeHTML(a)}</li>`).join("")}</ul>`;
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
  if (!currentListing || selectedForCompare.size === 0) return;

  const extras = selectorListings.filter((l) => selectedForCompare.has(String(l.id)));
  const listings = [currentListing, ...extras];

  compareTableEl.innerHTML = compareModalTableHTML(listings);
  compareModal.hidden = false;
  document.body.classList.add("compare-modal-open");
  compareModal.querySelector(".compare-modal__close")?.focus();
}

function closeCompareModal() {
  compareModal.hidden = true;
  document.body.classList.remove("compare-modal-open");
}

// ── Lightbox helpers ──────────────────────────────────────────

function getLightboxParts() {
  const lightbox = cardEl.querySelector("[data-lightbox]");
  if (!lightbox) return null;

  return {
    lightbox,
    image:       lightbox.querySelector("[data-lightbox-image]"),
    caption:     lightbox.querySelector("[data-lightbox-caption]"),
    closeButton: lightbox.querySelector(".lightbox__close"),
    prevButton:  lightbox.querySelector("[data-lightbox-prev]"),
    nextButton:  lightbox.querySelector("[data-lightbox-next]"),
  };
}

function renderLightboxImage(index) {
  const parts = getLightboxParts();
  if (!parts || !detailImages.length) return;

  const normalizedIndex = ((index % detailImages.length) + detailImages.length) % detailImages.length;
  const image = detailImages[normalizedIndex];

  activeLightboxIndex = normalizedIndex;
  parts.image.src = image.url;
  parts.image.alt = image.alt;
  parts.caption.textContent = image.caption;
  if (parts.prevButton) parts.prevButton.disabled = detailImages.length < 2;
  if (parts.nextButton) parts.nextButton.disabled = detailImages.length < 2;
}

function openLightbox(index) {
  const parts = getLightboxParts();
  if (!parts || !detailImages.length) return;

  renderLightboxImage(index);
  parts.lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  parts.closeButton?.focus();
}

function closeLightbox() {
  const parts = getLightboxParts();
  if (!parts) return;

  parts.lightbox.hidden = true;
  parts.image.src = "";
  parts.image.alt = "";
  parts.caption.textContent = "";
  activeLightboxIndex = -1;
  document.body.classList.remove("lightbox-open");
}

function showPreviousLightboxImage() {
  if (detailImages.length < 2 || activeLightboxIndex < 0) return;
  renderLightboxImage(activeLightboxIndex - 1);
}

function showNextLightboxImage() {
  if (detailImages.length < 2 || activeLightboxIndex < 0) return;
  renderLightboxImage(activeLightboxIndex + 1);
}

// ── Event delegation ──────────────────────────────────────────

// Detail card: lightbox + compare selector trigger
cardEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-lightbox-close]")) closeLightbox();
});

cardEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-lightbox-close]"))  { closeLightbox(); return; }
  if (event.target.closest("[data-lightbox-prev]"))   { showPreviousLightboxImage(); return; }
  if (event.target.closest("[data-lightbox-next]"))   { showNextLightboxImage(); return; }
  if (event.target.closest("[data-open-compare-selector]")) { openSelector(); return; }

  const zoomTrigger = event.target.closest("[data-zoom-index]");
  if (zoomTrigger && performance.now() >= lightboxReadyAt) {
    openLightbox(Number(zoomTrigger.dataset.zoomIndex));
  }
});

// Selector modal
selectorModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-selector-close]")) { closeSelector(); return; }

  const toggleBtn = event.target.closest("[data-toggle-id]");
  if (toggleBtn) { toggleSelectorItem(toggleBtn.dataset.toggleId); return; }

  if (event.target.closest("#compareNowBtn")) {
    closeSelector();
    openCompareModal();
  }
});

// Compare modal
compareModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-compare-close]")) closeCompareModal();
});

// Keyboard
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!compareModal.hidden)  { closeCompareModal(); return; }
    if (!selectorModal.hidden) { closeSelector(); return; }
    closeLightbox();
    return;
  }

  const lightboxIsOpen = Boolean(
    cardEl.querySelector("[data-lightbox]") &&
    !cardEl.querySelector("[data-lightbox]")?.hidden
  );
  if (!lightboxIsOpen) return;

  if (event.key === "ArrowLeft")  showPreviousLightboxImage();
  if (event.key === "ArrowRight") showNextLightboxImage();
});

// ── Load listing ──────────────────────────────────────────────

async function loadDetail() {
  if (!id) {
    setStatus("No listing ID provided.", "error");
    cardEl.innerHTML = messageStateHTML(
      "This listing link is incomplete",
      "Go back to the listings page and open a property from there."
    );
    return;
  }

  setStatus("Loading listing details...");
  cardEl.innerHTML = loadingStateHTML();

  try {
    const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}`);
    if (res.status === 404) throw new Error("Listing not found");
    if (!res.ok) throw new Error("Failed to load listing");

    const listing = await res.json();
    currentListing = listing; // store for compare feature

    detailImages = buildDetailImages(listing).images.map((image) => ({
      url:     image.url,
      alt:     `${listing.title || "Listing"} ${titleCaseLabel(image.label)}`,
      caption: titleCaseLabel(image.label),
    }));
    lightboxReadyAt = performance.now() + 450;
    setStatus("");
    cardEl.innerHTML = detailHTML(listing);
  } catch (error) {
    setStatus(error.message, "error");
    cardEl.innerHTML = messageStateHTML(
      error.message === "Listing not found" ? "Listing not found" : "Unable to load this listing",
      error.message === "Listing not found"
        ? "The property may have been removed or the link may be outdated."
        : "Please refresh the page or return to the listings view and try again."
    );
  }
}

loadDetail();
