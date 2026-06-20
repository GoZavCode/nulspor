// tests/smoke.mjs
//
// Simpelt smoke-test-script uden eksternt test-framework. Starter
// serveren, slaar paa de vigtigste routes og API-endpoints, og fejler
// (exit code 1) hvis noget ikke virker som forventet. Koeres i CI via
// `npm test`.

import { spawn } from "child_process";
import assert from "assert";

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // server ikke klar endnu
    }
    await wait(300);
  }
  throw new Error("Server svarede ikke i tide.");
}

async function run() {
  console.log("Starter Nulspor server til test...");
  const server = spawn("node", ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: "./data/test.db", SMTP_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (d) => (serverOutput += d));
  server.stderr.on("data", (d) => (serverOutput += d));

  try {
    await waitForServer();
    console.log("Server klar. Koerer tests...\n");

    // --- Frontend-sider ---
    for (const path of ["/", "/del", "/paste", "/mail", "/metadata", "/privatlivspolitik"]) {
      const res = await fetch(`${BASE}${path}`);
      assert.strictEqual(res.status, 200, `Forventede 200 for ${path}, fik ${res.status}`);
      console.log(`OK  ${path} -> 200`);
    }

    // --- Statiske assets ---
    for (const path of [
      "/css/style.css",
      "/css/mail.css",
      "/css/metadata.css",
      "/js/crypto.js",
      "/js/mail.js",
      "/js/metadata-jpeg.js",
      "/js/metadata-png.js",
      "/js/metadata-analyze.js",
      "/js/metadata-ui.js",
      "/vendor/exifr.js",
      "/vendor/pdf-lib.js",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      assert.strictEqual(res.status, 200, `Forventede 200 for ${path}, fik ${res.status}`);
      console.log(`OK  ${path} -> 200`);
    }

    // --- Paste API: opret og hent ---
    const createRes = await fetch(`${BASE}/api/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ciphertext: "dGVzdC1jaXBoZXJ0ZXh0",
        iv: "dGVzdC1pdg==",
        burnAfterReading: false,
        expiry: "1h",
      }),
    });
    assert.strictEqual(createRes.status, 200, "Paste-oprettelse fejlede");
    const created = await createRes.json();
    assert.ok(created.id, "Paste-oprettelse returnerede intet id");
    console.log("OK  POST /api/paste -> 200 + id");

    const fetchRes = await fetch(`${BASE}/api/paste/${created.id}`);
    assert.strictEqual(fetchRes.status, 200, "Paste-hentning fejlede");
    console.log("OK  GET /api/paste/:id -> 200");

    // --- Paste API: burn-after-reading skal slette efter foerste visning ---
    const burnRes = await fetch(`${BASE}/api/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ciphertext: "burn-test",
        iv: "iv",
        burnAfterReading: true,
        expiry: "1h",
      }),
    });
    const burnCreated = await burnRes.json();

    const firstView = await fetch(`${BASE}/api/paste/${burnCreated.id}`);
    assert.strictEqual(firstView.status, 200, "Foerste visning af burn-paste fejlede");

    const secondView = await fetch(`${BASE}/api/paste/${burnCreated.id}`);
    assert.strictEqual(secondView.status, 404, "Burn-after-reading slettede ikke pasten korrekt");
    console.log("OK  Burn-after-reading sletter efter foerste visning");

    // --- 404 for ukendt paste ---
    const notFoundRes = await fetch(`${BASE}/api/paste/findesikke123`);
    assert.strictEqual(notFoundRes.status, 404, "Ukendt paste-id gav ikke 404");
    console.log("OK  Ukendt paste-id -> 404");

    // --- Deling API: upload kraever en fil ---
    const noFileRes = await fetch(`${BASE}/api/share/upload`, { method: "POST" });
    assert.strictEqual(noFileRes.status, 400, "Upload uden fil gav ikke 400");
    console.log("OK  POST /api/share/upload uden fil -> 400");

    // --- Mail API: opret adresse ---
    const mailCreateRes = await fetch(`${BASE}/api/mail/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiry: "1h" }),
    });
    assert.strictEqual(mailCreateRes.status, 200, "Mail-adresse-oprettelse fejlede");
    const mailCreated = await mailCreateRes.json();
    assert.ok(mailCreated.address, "Mail-oprettelse returnerede ingen adresse");
    assert.ok(mailCreated.inboxToken, "Mail-oprettelse returnerede intet inbox-token");
    console.log("OK  POST /api/mail/address -> 200 + adresse + token");

    // --- Mail API: indbakke kraever korrekt token ---
    const noTokenRes = await fetch(`${BASE}/api/mail/address/${mailCreated.address}/messages`);
    assert.strictEqual(noTokenRes.status, 403, "Indbakke uden token gav ikke 403");
    console.log("OK  GET indbakke uden token -> 403");

    const wrongTokenRes = await fetch(`${BASE}/api/mail/address/${mailCreated.address}/messages`, {
      headers: { "X-Inbox-Token": "forkert-token" },
    });
    assert.strictEqual(wrongTokenRes.status, 403, "Indbakke med forkert token gav ikke 403");
    console.log("OK  GET indbakke med forkert token -> 403");

    const correctTokenRes = await fetch(`${BASE}/api/mail/address/${mailCreated.address}/messages`, {
      headers: { "X-Inbox-Token": mailCreated.inboxToken },
    });
    assert.strictEqual(correctTokenRes.status, 200, "Indbakke med korrekt token fejlede");
    const inboxData = await correctTokenRes.json();
    assert.deepStrictEqual(inboxData.messages, [], "Ny postkasse skulle vaere tom");
    console.log("OK  GET indbakke med korrekt token -> 200, tom indbakke");

    // --- Mail API: brugerdefineret adresse + kollisionstjek ---
    const customRes = await fetch(`${BASE}/api/mail/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customLocalPart: "ci-test-adresse", expiry: "1h" }),
    });
    assert.strictEqual(customRes.status, 200, "Brugerdefineret adresse-oprettelse fejlede");
    console.log("OK  POST /api/mail/address med customLocalPart -> 200");

    const duplicateRes = await fetch(`${BASE}/api/mail/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customLocalPart: "ci-test-adresse", expiry: "1h" }),
    });
    assert.strictEqual(duplicateRes.status, 409, "Dublet-adresse gav ikke 409");
    console.log("OK  Dublet brugerdefineret adresse -> 409");

    console.log("\nAlle smoke-tests bestaaet.");
  } catch (err) {
    console.error("\nTEST FEJLEDE:", err.message);
    console.error("\n--- Server-output ---");
    console.error(serverOutput);
    process.exitCode = 1;
  } finally {
    server.kill();
    await wait(300);
  }
}

run();
