// server-side/index.js (CommonJS)
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// ---------- FIREBASE ADMIN SETUP (USING JSON FILE) ----------

// Load the JSON file directly (make sure this path is correct)
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ---------- EXPRESS APP ----------

const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// In-memory shoe list (replace with DB later)
let shoes = [];
let nextShoeId = 1;

// Middleware to verify Firebase ID token from frontend
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Simple helper: only allow admin@gmail.com
function requireAdmin(req, res, next) {
  if (!req.user || req.user.email !== "admin@gmail.com") {
    return res
      .status(403)
      .json({ error: "Only admin can perform this action" });
  }
  next();
}

// Protected profile API
app.post("/api/profile", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRecord = await admin.auth().getUser(uid);

    res.json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      role: "customer",
      note: "Premium member of Majestic Shoe Palace",
    });
  } catch (err) {
    console.error("Failed to fetch user record:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// --- SHOES API ---

// Admin: create a shoe
app.post("/api/admin/shoes", verifyFirebaseToken, requireAdmin, (req, res) => {
  try {
    const {
      name,
      price,
      category,
      description,
      images,
      tag,
    } = req.body;

    if (
      !name ||
      !price ||
      !category ||
      !images ||
      !Array.isArray(images) ||
      images.length === 0
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newShoe = {
      id: nextShoeId++,
      name,
      price,
      category,
      description: description || "",
      images,
      tag: tag || "",
      createdAt: new Date().toISOString(),
    };

    shoes.push(newShoe);
    res.status(201).json(newShoe);
  } catch (err) {
    console.error("Failed to create shoe:", err);
    res.status(500).json({ error: "Failed to create shoe" });
  }
});

// Public: list shoes
app.get("/api/shoes", (req, res) => {
  res.json(shoes);
});

// Public: single shoe by id
app.get("/api/shoes/:id", (req, res) => {
  const id = Number(req.params.id);
  const shoe = shoes.find((s) => s.id === id);
  if (!shoe) {
    return res.status(404).json({ error: "Shoe not found" });
  }
  res.json(shoe);
});

// --- WHATSAPP NOTIFICATION API ---
// This is called from Checkout.jsx after an order is created
app.post("/api/send-whatsapp", async (req, res) => {
  try {
    const { to, orderId, fullName, products } = req.body;

    if (!to || !orderId || !fullName || !Array.isArray(products)) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const messageText = `New order received
ID: ${orderId}
Customer: ${fullName}
Products: ${products.join(", ")}`;

    // TODO: integrate your WhatsApp provider here (Twilio / Cloud API).
    // For now, just log it so you know it is wired correctly:
    console.log("Would send WhatsApp to:", to);
    console.log(messageText);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to send WhatsApp:", err);
    return res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
