// routes/mail.js
//
// API til Nulspor Mail. Adgang til en postkasse kraever det
// "inbox_token" der blev udstedt ved oprettelse, ikke kun kendskab til
// selve adressen, saa man ikke kan gaette sig til andres indbakker
// blot ved at gaette en kort, generet adresse.

import express from "express";
import crypto from "crypto";
import { customAlphabet } from "nanoid";

import {
  insertMailAddress,
  getMailAddress,
  addressExists,
  deleteMailAddress,
  getExpiredMailAddresses,
  getMailMessagesForAddress,
  getMailMessage,
} from "../db.js";

const router = express.Router();

const MAIL_DOMAIN = process.env.MAIL_DOMAIN || "nulspor.dk";
const genRandomLocalPart = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

const EXPIRY_OPTIONS = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

const CUSTOM_LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

function generateInboxToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getBearerToken(req) {
  const header = req.headers["x-inbox-token"];
  return typeof header === "string" ? header : null;
}

// --- Opret en ny adresse ---
router.post("/address", (req, res) => {
  try {
    const { customLocalPart, expiry } = req.body;

    const expiryMs = EXPIRY_OPTIONS[expiry];
    if (!expiryMs) {
      return res.status(400).json({ error: "Ugyldig udløbsperiode." });
    }

    let localPart;
    if (customLocalPart) {
      const candidate = String(customLocalPart).trim().toLowerCase();
      if (!CUSTOM_LOCAL_PART_PATTERN.test(candidate)) {
        return res.status(400).json({
          error: "Adressen skal være 3-32 tegn, kun bogstaver, tal, punktum, bindestreg og underscore.",
        });
      }
      localPart = candidate;
    } else {
      localPart = genRandomLocalPart();
    }

    const address = `${localPart}@${MAIL_DOMAIN}`;

    if (addressExists(address)) {
      return res.status(409).json({ error: "Denne adresse er allerede i brug. Vælg en anden." });
    }

    const inboxToken = generateInboxToken();
    const now = Date.now();
    const expiresAt = now + expiryMs;

    insertMailAddress({ address, inboxToken, createdAt: now, expiresAt });

    res.json({ address, inboxToken, expiresAt });
  } catch (err) {
    console.error("Mail address create error:", err);
    res.status(500).json({ error: "Der gik noget galt under oprettelse af adressen." });
  }
});

// --- Tjek om en brugerdefineret adresse er ledig (foer oprettelse) ---
router.get("/address/:localPart/available", (req, res) => {
  const candidate = req.params.localPart.trim().toLowerCase();
  if (!CUSTOM_LOCAL_PART_PATTERN.test(candidate)) {
    return res.json({ available: false });
  }
  const address = `${candidate}@${MAIL_DOMAIN}`;
  res.json({ available: !addressExists(address) });
});

// --- Hent metadata om egen postkasse (kraever token) ---
router.get("/address/:address", (req, res) => {
  const address = req.params.address.trim().toLowerCase();
  const token = getBearerToken(req);

  const entry = getMailAddress(address);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Denne postkasse findes ikke eller er udløbet." });
  }
  if (!token || token !== entry.inboxToken) {
    return res.status(403).json({ error: "Forkert eller manglende adgangstoken." });
  }

  res.json({ address: entry.address, createdAt: entry.createdAt, expiresAt: entry.expiresAt });
});

// --- Hent liste af mails i en postkasse ---
router.get("/address/:address/messages", (req, res) => {
  const address = req.params.address.trim().toLowerCase();
  const token = getBearerToken(req);

  const entry = getMailAddress(address);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Denne postkasse findes ikke eller er udløbet." });
  }
  if (!token || token !== entry.inboxToken) {
    return res.status(403).json({ error: "Forkert eller manglende adgangstoken." });
  }

  const messages = getMailMessagesForAddress(address);
  res.json({ messages });
});

// --- Hent en enkelt mails fulde indhold ---
router.get("/address/:address/messages/:id", (req, res) => {
  const address = req.params.address.trim().toLowerCase();
  const token = getBearerToken(req);

  const entry = getMailAddress(address);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Denne postkasse findes ikke eller er udløbet." });
  }
  if (!token || token !== entry.inboxToken) {
    return res.status(403).json({ error: "Forkert eller manglende adgangstoken." });
  }

  const message = getMailMessage(req.params.id, address);
  if (!message) {
    return res.status(404).json({ error: "Beskeden findes ikke." });
  }

  res.json(message);
});

// --- Ryd op i udloebne adresser (og deres mails, via deleteMailAddress) ---
function cleanupExpiredMail() {
  const expired = getExpiredMailAddresses(Date.now());
  for (const entry of expired) {
    deleteMailAddress(entry.address);
    console.log(`Ryddet udløbet mailadresse: ${entry.address}`);
  }
}

export { router as mailRouter, cleanupExpiredMail, MAIL_DOMAIN };
