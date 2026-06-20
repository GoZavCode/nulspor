// routes/paste.js
//
// API til Nulspor Paste. Serveren ser KUN krypteret data (ciphertext,
// iv, salt) - aldrig adgangskoder i klartekst, og aldrig den noegle
// der bruges til at dekryptere. Noeglen lever udelukkende i browseren
// og i URL-fragmentet, som aldrig sendes over netvaerket.

import express from "express";
import { customAlphabet } from "nanoid";
import {
  insertPaste,
  getPaste,
  incrementPasteViewCount,
  deletePaste,
  getExpiredPastes,
} from "../db.js";

const router = express.Router();
const genId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

const MAX_CIPHERTEXT_LENGTH = 16 * 1024 * 1024; // ~16MB krypteret payload, giver plads til tekst + en mindre filvedhaeftning (maks 10MB raw fil, foer base64-overhead)

const EXPIRY_OPTIONS = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

// --- Opret paste ---
router.post("/", (req, res) => {
  try {
    const { ciphertext, iv, salt, passwordProtected, burnAfterReading, syntaxMode, expiry } = req.body;

    if (!ciphertext || !iv) {
      return res.status(400).json({ error: "Mangler krypteret indhold." });
    }
    if (typeof ciphertext !== "string" || ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
      return res.status(413).json({ error: "Indholdet er for stort." });
    }

    const id = genId();
    const now = Date.now();
    let expiresAt = null;

    if (expiry && expiry !== "never") {
      const ms = EXPIRY_OPTIONS[expiry];
      if (!ms) {
        return res.status(400).json({ error: "Ugyldig udløbsperiode." });
      }
      expiresAt = now + ms;
    }

    insertPaste({
      id,
      ciphertext,
      iv,
      salt: salt || null,
      passwordProtected: Boolean(passwordProtected),
      burnAfterReading: Boolean(burnAfterReading),
      syntaxMode: syntaxMode || null,
      createdAt: now,
      expiresAt,
    });

    res.json({ id, expiresAt });
  } catch (err) {
    console.error("Paste create error:", err);
    res.status(500).json({ error: "Der gik noget galt under oprettelse." });
  }
});

// --- Hent paste (metadata + ciphertext) ---
router.get("/:id", (req, res) => {
  try {
    const paste = getPaste(req.params.id);

    if (!paste) {
      return res.status(404).json({ error: "Denne paste findes ikke, er udløbet, eller er allerede blevet vist." });
    }

    if (paste.expiresAt && paste.expiresAt < Date.now()) {
      deletePaste(paste.id);
      return res.status(404).json({ error: "Denne paste er udløbet." });
    }

    // Selvdestruktion: slet UMIDDELBART efter denne respons er sendt,
    // saa et eventuelt race mellem to samtidige requests i hvert
    // fald kun lader én igennem med data.
    const responseBody = {
      ciphertext: paste.ciphertext,
      iv: paste.iv,
      salt: paste.salt,
      passwordProtected: paste.passwordProtected,
      burnAfterReading: paste.burnAfterReading,
      syntaxMode: paste.syntaxMode,
      createdAt: paste.createdAt,
    };

    if (paste.burnAfterReading) {
      deletePaste(paste.id);
    } else {
      incrementPasteViewCount(paste.id);
    }

    res.json(responseBody);
  } catch (err) {
    console.error("Paste fetch error:", err);
    res.status(500).json({ error: "Der gik noget galt." });
  }
});

// --- Ryd op i udloebne pastes ---
function cleanupExpiredPastes() {
  const expired = getExpiredPastes(Date.now());
  for (const paste of expired) {
    deletePaste(paste.id);
    console.log(`Ryddet udløbet paste: ${paste.id}`);
  }
}

export { router as pasteRouter, cleanupExpiredPastes };
