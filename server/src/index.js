const express = require("express");
const cors = require("cors");
require("dotenv").config();

const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const app = express();
const jwt = require("jsonwebtoken");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  console.log("Supabase key starts with:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 3)); 
  
  const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("CoZi API running 🚀");
});

/* GET ALL LISTINGS */
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

    res.json(listings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
  
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  
    const token = authHeader.split(" ")[1];
  
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }
/* GET SINGLE LISTING */
app.get("/api/listings/:id", async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    res.json(listing);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* CREATE LISTING (no image yet) */
app.post("/api/listings", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      amenities,
      price,
      contactNumber,
      imageUrl,
    } = req.body;

    const newListing = await prisma.listing.create({
      data: {
        title,
        description,
        location,
        amenities,
        price: Number(price),
        contactNumber,
        imageUrl,
      },
    });

    res.json(newListing);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
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
      const filename = `listing-${Date.now()}.${ext}`;
  
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.put("/api/listings/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const {
        title, description, location, amenities, price, contactNumber, imageUrl
      } = req.body;
  
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
        },
      });
  
      res.json(updated);
    } catch (error) {
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

    app.post("/api/admin/login", (req, res) => {
        const { password } = req.body;
      
        if (password !== process.env.ADMIN_PASSWORD) {
          return res.status(401).json({ error: "Invalid password" });
        }
      
        const token = jwt.sign(
          { role: "admin" },
          process.env.JWT_SECRET,
          { expiresIn: "2h" }
        );
      
        res.json({ token });
      });
  });