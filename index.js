// server-side/index.js (CommonJS)
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// --- FIREBASE ADMIN SETUP ---

// Log once if the private key is missing (helps in Render logs)
if (!process.env.FIREBASE_PRIVATE_KEY) {
  console.error("FIREBASE_PRIVATE_KEY is NOT set in environment variables");
}

// Build service account object from environment variables
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  // Env value should be a single line with literal '\n'; convert to real newlines
  private_key: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url:
    process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

// Initialize Firebase Admin with service account
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// --- EXPRESS APP SETUP ---

const app = express();

// IMPORTANT: in production, set this to your frontend URL on Render
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
app.post(
  "/api/admin/shoes",
  verifyFirebaseToken,
  requireAdmin,
  (req, res) => {
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
        return res
          .status(400)
          .json({ error: "Missing required fields" });
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
  }
);

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
