const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const multer = require("multer");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const { PrismaClient } = require("@prisma/client");

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

app.use(cors());
app.use(express.json());

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

function serializeListing(listing) {
  const images = normalizeStoredImages(listing.images, listing.imageUrl);

  return {
    ...listing,
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
    const { search, minPrice, maxPrice } = req.query;

    const listings = await prisma.listing.findMany({
      where: {
        AND: [
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
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
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
      amenities,
      price,
      contactNumber,
      bedrooms,
      furnished,
      sizesqm,
      floor,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const newListing = await prisma.listing.create({
      data: {
        title,
        description,
        location,
        amenities,
        price: Number(price),
        contactNumber,
        imageUrl,
        images,
        bedrooms: bedrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
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
      amenities,
      price,
      contactNumber,
      bedrooms,
      furnished,
      sizesqm,
      floor,
    } = req.body;
    const { imageUrl, images } = buildListingImageData(req.body.images, req.body.imageUrl);

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        title,
        description,
        location,
        amenities,
        price: Number(price),
        contactNumber,
        imageUrl,
        images,
        bedrooms: bedrooms || null,
        furnished: furnished || null,
        sizesqm: sizesqm ? Number(sizesqm) : null,
        floor: floor ? Number(floor) : null,
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

    await prisma.listing.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

app.post("/api/admin/login", (req, res) => {
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

app.post("/api/upload", requireAdmin, upload.single("image"), async (req, res) => {
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
