const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const multer = require("multer");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");
const rateLimit = require("express-rate-limit");

const prisma = new PrismaClient();
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const clientDir = path.join(__dirname, "../../client");
const IMAGE_LABELS = Object.freeze([
  "bedroom",
  "bathroom",
  "kitchen",
  "living room",
  "cover photo",
]);

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors({ origin: process.env.APP_URL || "http://localhost:3001" }));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

function normalizeImageLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

function validateAndNormalizeListingImages(rawImages) {
  if (rawImages == null) {
    return [];
  }

  if (!Array.isArray(rawImages)) {
    throw new AppError(400, "Images must be sent as an array");
  }

  if (rawImages.length > IMAGE_LABELS.length) {
    throw new AppError(400, "You can upload at most 5 labeled images");
  }

  const imageMap = new Map();

  rawImages.forEach((rawImage) => {
    if (!rawImage || typeof rawImage !== "object" || Array.isArray(rawImage)) {
      throw new AppError(400, "Each image entry must be an object");
    }

    const label = normalizeImageLabel(rawImage.label);
    const url = String(rawImage.url ?? "").trim();

    if (!IMAGE_LABELS.includes(label)) {
      throw new AppError(400, `Image label must be one of: ${IMAGE_LABELS.join(", ")}`);
    }

    if (!url) {
      throw new AppError(400, `Missing URL for ${label}`);
    }

    if (imageMap.has(label)) {
      throw new AppError(400, `Duplicate image label: ${label}`);
    }

    imageMap.set(label, url);
  });

  return IMAGE_LABELS
    .filter((label) => imageMap.has(label))
    .map((label) => ({ label, url: imageMap.get(label) }));
}

function normalizeStoredImages(rawImages, fallbackImageUrl) {
  const imageMap = new Map();

  if (Array.isArray(rawImages)) {
    rawImages.forEach((rawImage) => {
      if (!rawImage || typeof rawImage !== "object" || Array.isArray(rawImage)) {
        return;
      }

      const label = normalizeImageLabel(rawImage.label);
      const url = String(rawImage.url ?? "").trim();

      if (!IMAGE_LABELS.includes(label) || !url || imageMap.has(label)) {
        return;
      }

      imageMap.set(label, url);
    });
  }

  const fallbackUrl = String(fallbackImageUrl ?? "").trim();
  if (!imageMap.size && fallbackUrl) {
    imageMap.set("cover photo", fallbackUrl);
  }

  return IMAGE_LABELS
    .filter((label) => imageMap.has(label))
    .map((label) => ({ label, url: imageMap.get(label) }));
}

function getPrimaryImageUrl(images, fallbackImageUrl) {
  const coverPhoto = images.find((image) => image.label === "cover photo")?.url;
  const fallbackUrl = String(fallbackImageUrl ?? "").trim();
  return coverPhoto || images[0]?.url || fallbackUrl || null;
}

function buildListingImageData(rawImages, rawImageUrl) {
  const normalizedImages = validateAndNormalizeListingImages(rawImages);
  const fallbackUrl = String(rawImageUrl ?? "").trim();
  const images = normalizedImages.length
    ? normalizedImages
    : normalizeStoredImages(null, fallbackUrl);

  return {
    images: images.length ? images : null,
    imageUrl: getPrimaryImageUrl(images, fallbackUrl),
  };
}

function extractStorageFilename(url) {
  if (!url || typeof url !== "string") return null;
  const marker = `/object/public/${process.env.SUPABASE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

function parseStoredAmenities(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return String(raw).split(",").map((a) => a.trim()).filter(Boolean);
}

function processIncomingAmenities(raw) {
  if (Array.isArray(raw)) return JSON.stringify(raw.filter(Boolean));
  if (!raw) return null;
  return JSON.stringify(String(raw).split(",").map((a) => a.trim()).filter(Boolean));
}

function serializeListing(listing) {
  const images = normalizeStoredImages(listing.images, listing.imageUrl);

  return {
    ...listing,
    amenities: parseStoredAmenities(listing.amenities),
    images,
    imageUrl: getPrimaryImageUrl(images, listing.imageUrl),
  };
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/listings", async (req, res) => {
  try {
    const { search, minPrice, maxPrice, bedrooms, furnished, petsAllowed } = req.query;
    const amenityFilter = req.query.amenities
      ? (Array.isArray(req.query.amenities) ? req.query.amenities : [req.query.amenities])
      : [];

    const listings = await prisma.listing.findMany({
      where: {
        AND: [
          { status: "available" },
          search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" } },
                  { location: { contains: search, mode: "insensitive" } },
                ],
              }
            : {},
          minPrice ? { price: { gte: Number(minPrice) } } : {},
          maxPrice ? { price: { lte: Number(maxPrice) } } : {},
          bedrooms ? { bedrooms } : {},
          furnished ? { furnished } : {},
          petsAllowed ? { petsAllowed } : {},
          ...amenityFilter.map((a) => ({ amenities: { contains: a, mode: "insensitive" } })),
        ],
      },
      orderBy: [{ verified: "desc" }, { createdAt: "desc" }],
    });

    res.json(listings.map(serializeListing));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/listings/:id", async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (!req.headers.authorization) {
      prisma.listing.update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {});
    }

    res.json(serializeListing(listing));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/listings", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      price,
      contactNumber,
      bedrooms,
      bathrooms,
      furnished,
      sizesqm,
      floor,
      leaseTerm,
      advanceDeposit,
      petsAllowed,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const newListing = await prisma.listing.create({
      data: {
        title,
        description,
        location,
        amenities: processIncomingAmenities(req.body.amenities),
        price: Number(price),
        contactNumber,
        imageUrl,
        images,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
        leaseTerm: leaseTerm || null,
        advanceDeposit: advanceDeposit || null,
        petsAllowed: petsAllowed || null,
      },
    });

    res.json(serializeListing(newListing));
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.put("/api/listings/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      title,
      description,
      location,
      price,
      contactNumber,
      bedrooms,
      bathrooms,
      furnished,
      sizesqm,
      floor,
      leaseTerm,
      advanceDeposit,
      petsAllowed,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        title,
        description,
        location,
        amenities: processIncomingAmenities(req.body.amenities),
        price: Number(price),
        contactNumber,
        imageUrl,
        images,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
        leaseTerm: leaseTerm || null,
        advanceDeposit: advanceDeposit || null,
        petsAllowed: petsAllowed || null,
      },
    });

    res.json(serializeListing(updated));
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error(error);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

app.delete("/api/listings/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const listing = await prisma.listing.findUnique({ where: { id } });

    if (listing) {
      const images = normalizeStoredImages(listing.images, listing.imageUrl);
      const filenames = images
        .map((img) => extractStorageFilename(img.url))
        .filter(Boolean);

      if (filenames.length) {
        const { error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .remove(filenames);
        if (error) console.error("Storage cleanup error:", error);
      }
    }

    await prisma.listing.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

app.post("/api/admin/login", authLimiter, (req, res) => {
  const { password } = req.body;

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD not set" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "JWT_SECRET not set" });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

function requireAdminOrLandlord(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role === "landlord") req.landlordId = payload.landlordId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/api/upload", requireAdminOrLandlord, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = req.file.originalname.split(".").pop();
    const filename = `listing-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const { data } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(filename);

    res.json({ publicUrl: data.publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── Landlord dashboard ────────────────────────────────────────

app.get("/api/landlord/me", requireLandlord, async (req, res) => {
  try {
    const landlord = await prisma.landlord.findUnique({
      where: { id: req.landlordId },
      select: { id: true, fullName: true, email: true, isVerified: true },
    });
    if (!landlord) return res.status(404).json({ error: "Not found" });
    res.json(landlord);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/landlord/listings", requireLandlord, async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { landlordId: req.landlordId },
      orderBy: { createdAt: "desc" },
    });
    res.json(listings.map(serializeListing));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/landlord/stats", requireLandlord, async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { landlordId: req.landlordId },
      select: { status: true, viewCount: true },
    });
    res.json({
      activeListings: listings.filter((l) => l.status === "available").length,
      totalViews: listings.reduce((sum, l) => sum + l.viewCount, 0),
      totalInquiries: 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/landlord/listings/:id/status", requireLandlord, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!["available", "rented", "hidden"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const listing = await prisma.listing.findFirst({ where: { id, landlordId: req.landlordId } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const updated = await prisma.listing.update({ where: { id }, data: { status } });
    res.json(serializeListing(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/landlord/listings/:id", requireLandlord, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const listing = await prisma.listing.findFirst({ where: { id, landlordId: req.landlordId } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const images = normalizeStoredImages(listing.images, listing.imageUrl);
    const filenames = images.map((img) => extractStorageFilename(img.url)).filter(Boolean);
    if (filenames.length) {
      const { error } = await supabase.storage.from(process.env.SUPABASE_BUCKET).remove(filenames);
      if (error) console.error("Storage cleanup error:", error);
    }

    await prisma.listing.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/landlord/listings", requireLandlord, async (req, res) => {
  try {
    const {
      title, description, location, price, contactNumber,
      bedrooms, bathrooms, furnished, sizesqm, floor,
      leaseTerm, advanceDeposit, petsAllowed,
      viberNumber, messengerUrl, contactEmail,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const newListing = await prisma.listing.create({
      data: {
        landlordId: req.landlordId,
        title, description, location,
        amenities: processIncomingAmenities(req.body.amenities),
        price: Number(price),
        contactNumber,
        imageUrl, images,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
        leaseTerm: leaseTerm || null,
        advanceDeposit: advanceDeposit || null,
        petsAllowed: petsAllowed || null,
        viberNumber: viberNumber || null,
        messengerUrl: messengerUrl || null,
        contactEmail: contactEmail || null,
      },
    });

    res.json(serializeListing(newListing));
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.put("/api/landlord/listings/:id", requireLandlord, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      title, description, location, price, contactNumber,
      bedrooms, bathrooms, furnished, sizesqm, floor,
      leaseTerm, advanceDeposit, petsAllowed,
      viberNumber, messengerUrl, contactEmail,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const existing = await prisma.listing.findFirst({ where: { id, landlordId: req.landlordId } });
    if (!existing) return res.status(404).json({ error: "Listing not found" });

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        title, description, location,
        amenities: processIncomingAmenities(req.body.amenities),
        price: Number(price),
        contactNumber, imageUrl, images,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
        leaseTerm: leaseTerm || null,
        advanceDeposit: advanceDeposit || null,
        petsAllowed: petsAllowed || null,
        viberNumber: viberNumber || null,
        messengerUrl: messengerUrl || null,
        contactEmail: contactEmail || null,
      },
    });

    res.json(serializeListing(updated));
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// ── Admin: landlord management ────────────────────────────────

app.get("/api/admin/landlords", requireAdmin, async (req, res) => {
  try {
    const landlords = await prisma.landlord.findMany({
      select: {
        id: true, fullName: true, email: true,
        isVerified: true, emailVerified: true, createdAt: true,
        _count: { select: { listings: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(landlords);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/admin/listings/:id/verify", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { verified } = req.body;
    const updated = await prisma.listing.update({
      where: { id },
      data: { verified: Boolean(verified) },
    });
    res.json({ id: updated.id, verified: updated.verified });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/admin/landlords/:id/verify", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isVerified } = req.body;
    const updated = await prisma.landlord.update({
      where: { id },
      data: { isVerified: Boolean(isVerified) },
    });
    res.json({ id: updated.id, isVerified: updated.isVerified });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ── Landlord auth ─────────────────────────────────────────────

let resend;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function expiresAt(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function sendEmail(to, subject, html) {
  const from = process.env.RESEND_FROM || "CoZi <onboarding@resend.dev>";
  const { error } = await getResend().emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
}

function verificationEmailHtml(fullName, url) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#fdf8f2;">
      <h1 style="color:#2b2116;font-size:22px;margin:0 0 8px;">Verify your email address</h1>
      <p style="color:#7d7063;margin:0 0 24px;">Hi ${fullName}, thanks for signing up with CoZi. Click below to verify your email and activate your landlord account.</p>
      <a href="${url}" style="display:inline-block;background:#3e7a59;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;">Verify Email</a>
      <p style="color:#7d7063;font-size:13px;margin:24px 0 0;">This link expires in 24 hours. If you didn't sign up for CoZi, ignore this email.</p>
    </div>
  `;
}

function resetEmailHtml(fullName, url) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#fdf8f2;">
      <h1 style="color:#2b2116;font-size:22px;margin:0 0 8px;">Reset your password</h1>
      <p style="color:#7d7063;margin:0 0 24px;">Hi ${fullName}, we received a request to reset your CoZi password. Click below to choose a new one.</p>
      <a href="${url}" style="display:inline-block;background:#3e7a59;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;">Reset Password</a>
      <p style="color:#7d7063;font-size:13px;margin:24px 0 0;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>
  `;
}

function requireLandlord(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "landlord") return res.status(403).json({ error: "Forbidden" });
    req.landlordId = payload.landlordId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/api/landlord/signup", authLimiter, async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await prisma.landlord.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = generateToken();

    await prisma.landlord.create({
      data: {
        fullName,
        email,
        passwordHash,
        verificationToken,
        verificationTokenExpiresAt: expiresAt(24),
      },
    });

    const url = `${process.env.APP_URL}/landlord-verify?token=${verificationToken}`;
    try {
      await sendEmail(email, "Verify your CoZi account", verificationEmailHtml(fullName, url));
    } catch (emailError) {
      console.error("Verification email failed to send:", emailError.message);
    }

    res.json({ message: "Check your email to verify your account." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/landlord/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const landlord = await prisma.landlord.findFirst({
      where: { verificationToken: token, emailVerified: false },
    });

    if (!landlord) {
      return res.status(400).json({ error: "Invalid or already used verification link" });
    }
    if (new Date() > landlord.verificationTokenExpiresAt) {
      return res.status(400).json({ error: "Verification link has expired" });
    }

    await prisma.landlord.update({
      where: { id: landlord.id },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/landlord/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const landlord = await prisma.landlord.findUnique({ where: { email } });
    const valid = landlord && await bcrypt.compare(password, landlord.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!landlord.emailVerified) {
      return res.status(403).json({ error: "not_verified" });
    }

    const token = jwt.sign(
      { landlordId: landlord.id, role: "landlord" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, fullName: landlord.fullName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/landlord/resend-verification", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const landlord = await prisma.landlord.findUnique({ where: { email } });
    const silent = { message: "If that account exists and is unverified, we sent a new link." };

    if (!landlord || landlord.emailVerified) return res.json(silent);

    const verificationToken = generateToken();
    await prisma.landlord.update({
      where: { id: landlord.id },
      data: { verificationToken, verificationTokenExpiresAt: expiresAt(24) },
    });

    const url = `${process.env.APP_URL}/landlord-verify?token=${verificationToken}`;
    await sendEmail(email, "Verify your CoZi account", verificationEmailHtml(landlord.fullName, url));

    res.json(silent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/landlord/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const landlord = await prisma.landlord.findUnique({ where: { email } });

    if (landlord) {
      const resetToken = generateToken();
      await prisma.landlord.update({
        where: { id: landlord.id },
        data: { resetToken, resetTokenExpiresAt: expiresAt(1) },
      });
      const url = `${process.env.APP_URL}/landlord-reset-password?token=${resetToken}`;
      await sendEmail(email, "Reset your CoZi password", resetEmailHtml(landlord.fullName, url));
    }

    res.json({ message: "If that email is registered, you'll receive a reset link shortly." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/landlord/reset-password", async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const landlord = await prisma.landlord.findFirst({ where: { resetToken: token } });

    if (!landlord || new Date() > landlord.resetTokenExpiresAt) {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }

    await prisma.landlord.update({
      where: { id: landlord.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

if (!process.env.VERCEL) {
  app.use(express.static(clientDir, { extensions: ["html"] }));
}

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
