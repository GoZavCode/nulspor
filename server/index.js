// index.js — Nulspor server
//
// Samler alle vaerktoejer (Deling, Paste, og fremtidige tilfoejelser)
// under ét Express-app. Hvert vaerktoej har sin egen route-fil i
// server/routes/, saa det er nemt at tilfoeje flere senere.

import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { ensureUploadDir } from "./storage.js";
import { shareRouter, cleanupExpiredFiles, MAX_FILE_SIZE_MB } from "./routes/share.js";
import { pasteRouter, cleanupExpiredPastes } from "./routes/paste.js";
import { mailRouter, cleanupExpiredMail } from "./routes/mail.js";
import { startSmtpServer } from "./smtp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "20mb" })); // pastes kan indeholde en krypteret filvedhaeftning paa op til ca. 16MB

// --- Rate limiting ---
// Generel limiter til API-routes, lidt strammere paa upload/opret-endpoints.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange forespørgsler. Prøv igen om lidt." },
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange oprettelser fra din IP. Prøv igen senere." },
});

app.use("/api", generalLimiter);
app.use("/api/share/upload", createLimiter);
app.use("/api/paste", (req, res, next) => {
  if (req.method === "POST") return createLimiter(req, res, next);
  next();
});
app.use("/api/mail/address", (req, res, next) => {
  if (req.method === "POST") return createLimiter(req, res, next);
  next();
});

// --- API-routes ---
app.use("/api/share", shareRouter);
app.use("/api/paste", pasteRouter);
app.use("/api/mail", mailRouter);

// --- Frontend-sider ---
// Disse staar foer express.static, saa f.eks. "/del" og "/paste" ikke
// bliver opfanget af static-mappens automatiske trailing-slash-redirect
// (express.static ser mapperne public/del og public/paste og ville
// ellers redirecte "/del" -> "/del/" foer disse handlers naar at koere).
app.get("/del/f/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "del", "download.html"));
});
app.get("/del", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "del", "index.html"));
});
app.get("/paste/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "paste", "view.html"));
});
app.get("/paste", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "paste", "index.html"));
});
app.get("/mail", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "mail", "index.html"));
});
app.get("/metadata", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "metadata", "index.html"));
});
app.get("/privatlivspolitik", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "privatlivspolitik.html"));
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// --- Statiske assets (CSS, JS) ---
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Multer fejlhaandtering (fil for stor osv.) ---
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Filen er for stor. Maks er ${MAX_FILE_SIZE_MB} MB.` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Der gik noget galt." });
});

// --- Periodisk oprydning af udloebet indhold ---
function cleanupAll() {
  cleanupExpiredFiles();
  cleanupExpiredPastes();
  cleanupExpiredMail();
}

setInterval(cleanupAll, 60 * 60 * 1000);

await ensureUploadDir();
cleanupAll();

app.listen(PORT, () => {
  console.log(`Nulspor kører på http://localhost:${PORT}`);
});

// --- SMTP-server (Nulspor Mail) ---
// Lytter normalt paa port 25, hvilket kraever root/cap_net_bind_service
// paa Linux. Saettes SMTP_ENABLED=false (f.eks. i et udviklings- eller
// test-miljoe uden root), startes SMTP-serveren slet ikke, men resten
// af platformen koerer videre uden problemer.
if (process.env.SMTP_ENABLED !== "false") {
  try {
    startSmtpServer();
  } catch (err) {
    console.error("Kunne ikke starte SMTP-server (Nulspor Mail vil ikke kunne modtage mail):", err.message);
  }
} else {
  console.log("SMTP-server er deaktiveret (SMTP_ENABLED=false).");
}
