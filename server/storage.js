// storage.js
//
// Simpelt storage-lag. Lige nu gemmer vi filer på lokal disk, men alt
// der bruger storage gør det via disse funktioner - så hvis du senere
// vil skifte til S3-kompatibel storage (Cloudflare R2, MinIO, osv.),
// er det den her fil du skal udskifte. Resten af appen rører den aldrig.

import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Gemmer en fil på disk under det givne storageKey.
 * @param {string} storageKey - unikt navn filen skal gemmes som
 * @param {string} tmpFilePath - hvor multer har lagt filen midlertidigt
 */
async function saveFile(storageKey, tmpFilePath) {
  await ensureUploadDir();
  const dest = path.join(UPLOAD_DIR, storageKey);
  await fs.rename(tmpFilePath, dest);
  return dest;
}

/**
 * Returnerer en readable stream til filen, til brug ved download.
 */
function getFileStream(storageKey) {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  return createReadStream(filePath);
}

/**
 * Sletter en fil permanent fra storage.
 */
async function deleteFile(storageKey) {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Tjekker om en fil findes i storage.
 */
async function fileExists(storageKey) {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export { saveFile, getFileStream, deleteFile, fileExists, UPLOAD_DIR, ensureUploadDir };
