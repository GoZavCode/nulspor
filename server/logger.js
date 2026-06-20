// logger.js
//
// Skriver kun IP + tidspunkt + fil-id til en logfil ved upload.
// Brugt udelukkende til at kunne spore misbrug (spam, ulovligt
// indhold) - aldrig vist til brugere, ikke en del af nogen "konto".

import fs from "fs/promises";
import path from "path";

const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), "data", "upload-log.jsonl");

async function appendUploadLog(entry) {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.appendFile(LOG_FILE, JSON.stringify(entry) + "\n");
}

export { appendUploadLog };
