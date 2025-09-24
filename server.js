// server.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name =
      Date.now() + "-" + Math.random().toString(36).slice(2, 9) + ext;
    cb(null, name);
  },
});
const upload = multer({ storage });

// SQLite database
const db = new sqlite3.Database(path.join(__dirname, "db.sqlite"), (err) => {
  if (err) return console.error("DB open error:", err);
  console.log("SQLite DB opened.");
});
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    originalname TEXT,
    description TEXT,
    category TEXT,
    lat REAL,
    lon REAL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    status TEXT DEFAULT 'Pending'
  )`);
});

// API: Submit new report
app.post("/api/report", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image is required" });

  const { description, category, lat, lon } = req.body;
  const stmt = db.prepare(
    `INSERT INTO issues (filename, originalname, description, category, lat, lon)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    req.file.filename,
    req.file.originalname || null,
    description || null,
    category || null,
    lat ? Number(lat) : null,
    lon ? Number(lon) : null,
    function (err) {
      if (err) return res.status(500).json({ error: "DB insert failed" });
      const ticketId = "TC-" + (10000 + this.lastID);
      res.json({
        success: true,
        id: this.lastID,
        ticketId,
        imageUrl: "/uploads/" + req.file.filename,
      });
    }
  );
  stmt.finalize();
});

// API: List all reports
app.get("/api/reports", (req, res) => {
  db.all("SELECT * FROM issues ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// API: Count
app.get("/api/count", (req, res) => {
  db.get("SELECT COUNT(*) AS count FROM issues", (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ count: row.count });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
