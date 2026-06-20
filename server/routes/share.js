// routes/share.js
//
// API til Nulspor Deling. Genbygget fra AnonDrop-projektet, nu med
// SQLite i stedet for en JSON-fil som metadata-lager.

import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";

import { saveFile, getFileStream, deleteFile as deleteFileFromDisk, fileExists } from "../storage.js";
import {
  insertFile,
  getFile,
  incrementFileDownloadCount,
  deleteFile as deleteFileEntry,
  getExpiredFiles,
} from "../db.js";
import { appendUploadLog } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const genId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 9);

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 2048);
const DEFAULT_EXPIRY_DAYS = Number(process.env.DEFAULT_EXPIRY_DAYS || 7);
const MAX_EXPIRY_DAYS = Number(process.env.MAX_EXPIRY_DAYS || 30);

const upload = multer({
  dest: path.join(__dirname, "..", "..", "tmp-uploads"),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function getClientIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Ingen fil modtaget." });
    }

    const id = genId();
    const { password, expiryDays } = req.body;

    let days = Number(expiryDays) || DEFAULT_EXPIRY_DAYS;
    days = Math.min(Math.max(days, 1), MAX_EXPIRY_DAYS);
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

    const storageKey = `${id}__${req.file.originalname}`;
    await saveFile(storageKey, req.file.path);

    insertFile({
      id,
      originalName: req.file.originalname,
      storageKey,
      size: req.file.size,
      mimeType: req.file.mimetype,
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now(),
      expiresAt,
    });

    await appendUploadLog({
      id,
      ip: getClientIp(req),
      size: req.file.size,
      timestamp: new Date().toISOString(),
    });

    res.json({ id, link: `/del/f/${id}`, expiresAt });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Der gik noget galt under upload." });
  }
});

router.get("/file/:id", (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Filen findes ikke eller er udløbet." });
  }
  res.json({
    originalName: entry.originalName,
    size: entry.size,
    mimeType: entry.mimeType,
    requiresPassword: Boolean(entry.passwordHash),
    expiresAt: entry.expiresAt,
    downloadCount: entry.downloadCount,
  });
});

router.post("/file/:id/download", async (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Filen findes ikke eller er udløbet." });
  }

  if (entry.passwordHash) {
    const { password } = req.body;
    if (!password || hashPassword(password) !== entry.passwordHash) {
      return res.status(403).json({ error: "Forkert adgangskode." });
    }
  }

  const exists = await fileExists(entry.storageKey);
  if (!exists) {
    return res.status(404).json({ error: "Filen kunne ikke findes på serveren." });
  }

  incrementFileDownloadCount(entry.id);

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(entry.originalName)}"`);
  res.setHeader("Content-Type", entry.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", entry.size);

  const stream = getFileStream(entry.storageKey);
  stream.on("error", (err) => {
    console.error("Stream error:", err);
    res.status(500).end();
  });
  stream.pipe(res);
});

async function cleanupExpiredFiles() {
  const expired = getExpiredFiles(Date.now());
  for (const entry of expired) {
    await deleteFileFromDisk(entry.storageKey);
    deleteFileEntry(entry.id);
    console.log(`Ryddet udløbet fil: ${entry.id} (${entry.originalName})`);
  }
}

export { router as shareRouter, cleanupExpiredFiles, upload, MAX_FILE_SIZE_MB };
