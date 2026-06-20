// db.js
//
// SQLite-database for hele Nulspor-platformen. Bruger Node's
// indbyggede `node:sqlite` modul, saa der ikke kraeves native
// compile-toolchains paa serveren (ingen build-step, virker direkte).
//
// Indeholder to tabeller:
//   files  - metadata til Nulspor Deling (filupload)
//   pastes - krypterede blobs til Nulspor Paste
//
// Vigtigt for Paste: serveren gemmer ALDRIG en dekrypteringsnoegle.
// Kolonnen "ciphertext" er allerede krypteret af browseren foer det
// naar serveren. Serveren kan ikke laese indholdet.

import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), "data", "nulspor.db");

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT,
    password_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pastes (
    id TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    salt TEXT,
    password_protected INTEGER NOT NULL DEFAULT 0,
    burn_after_reading INTEGER NOT NULL DEFAULT 0,
    syntax_mode TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);
  CREATE INDEX IF NOT EXISTS idx_pastes_expires ON pastes(expires_at);
`);

// ---------- Files ----------

function insertFile(entry) {
  db.prepare(`
    INSERT INTO files (id, original_name, storage_key, size, mime_type, password_hash, created_at, expires_at, download_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    entry.id,
    entry.originalName,
    entry.storageKey,
    entry.size,
    entry.mimeType,
    entry.passwordHash,
    entry.createdAt,
    entry.expiresAt
  );
}

function getFile(id) {
  const row = db.prepare(`SELECT * FROM files WHERE id = ?`).get(id);
  return row ? rowToFile(row) : null;
}

function incrementFileDownloadCount(id) {
  db.prepare(`UPDATE files SET download_count = download_count + 1 WHERE id = ?`).run(id);
}

function deleteFile(id) {
  db.prepare(`DELETE FROM files WHERE id = ?`).run(id);
}

function getExpiredFiles(now) {
  return db.prepare(`SELECT * FROM files WHERE expires_at < ?`).all(now).map(rowToFile);
}

function rowToFile(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    storageKey: row.storage_key,
    size: row.size,
    mimeType: row.mime_type,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloadCount: row.download_count,
  };
}

// ---------- Pastes ----------

function insertPaste(entry) {
  db.prepare(`
    INSERT INTO pastes (id, ciphertext, iv, salt, password_protected, burn_after_reading, syntax_mode, created_at, expires_at, view_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    entry.id,
    entry.ciphertext,
    entry.iv,
    entry.salt || null,
    entry.passwordProtected ? 1 : 0,
    entry.burnAfterReading ? 1 : 0,
    entry.syntaxMode || null,
    entry.createdAt,
    entry.expiresAt || null
  );
}

function getPaste(id) {
  const row = db.prepare(`SELECT * FROM pastes WHERE id = ?`).get(id);
  return row ? rowToPaste(row) : null;
}

function incrementPasteViewCount(id) {
  db.prepare(`UPDATE pastes SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

function deletePaste(id) {
  db.prepare(`DELETE FROM pastes WHERE id = ?`).run(id);
}

function getExpiredPastes(now) {
  return db.prepare(`SELECT * FROM pastes WHERE expires_at IS NOT NULL AND expires_at < ?`).all(now).map(rowToPaste);
}

function rowToPaste(row) {
  return {
    id: row.id,
    ciphertext: row.ciphertext,
    iv: row.iv,
    salt: row.salt,
    passwordProtected: Boolean(row.password_protected),
    burnAfterReading: Boolean(row.burn_after_reading),
    syntaxMode: row.syntax_mode,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
  };
}

export {
  insertFile,
  getFile,
  incrementFileDownloadCount,
  deleteFile,
  getExpiredFiles,
  insertPaste,
  getPaste,
  incrementPasteViewCount,
  deletePaste,
  getExpiredPastes,
};
