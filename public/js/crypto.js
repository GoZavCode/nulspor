// crypto.js
//
// Al kryptering sker HER, i browseren, FOER noget sendes til serveren.
// Serveren modtager og gemmer kun ciphertext, og kan aldrig laese
// indholdet eller faa adgang til noeglen.
//
// Noeglen lever kun i URL-fragmentet (efter #), som browseren ALDRIG
// sender til serveren ved et HTTP-request. Det er kernen i sikkerheden.
//
// Algoritme: AES-256-GCM (autentificeret kryptering - beskytter baade
// fortrolighed og integritet, saa data ikke kan aendres ubemaerket).
//
// Hvis brugeren tilfoejer en adgangskode, bruges PBKDF2 til at udlede
// en separat noegle fra adgangskoden (saa selve indholds-noeglen i
// URL'en ikke er nok - man skal ogsaa kende password).

const NULSPOR_CRYPTO = (() => {
  const SALT_BYTES = 16;
  const IV_BYTES = 12; // standard for AES-GCM
  const PBKDF2_ITERATIONS = 250000;

  function bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function base64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Genererer en tilfaeldig 256-bit noegle og returnerer den som en
  // URL-sikker base64-streng, klar til at sidde i URL-fragmentet.
  async function generateKeyString() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    return bufToBase64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function importKeyFromString(keyStr) {
    const b64 = keyStr.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = base64ToBuf(padded);
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  // Udleder en noegle fra et password + salt via PBKDF2.
  // Bruges som et EKSTRA laag oven paa den almindelige noegle, naar
  // brugeren selv vaelger en adgangskode.
  async function deriveKeyFromPassword(password, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Krypterer en tekststreng med den givne noegle (fra URL-fragment).
   * Returnerer { ciphertext, iv } som base64-strenge, klar til at sendes
   * til serveren.
   */
  async function encrypt(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    return {
      ciphertext: bufToBase64(cipherBuf),
      iv: bufToBase64(iv),
    };
  }

  async function decrypt(ciphertextB64, ivB64, key) {
    const cipherBuf = base64ToBuf(ciphertextB64);
    const iv = base64ToBuf(ivB64);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
    return new TextDecoder().decode(plainBuf);
  }

  // Laeser en File som en base64-streng (raa binaer data, ikke tekst).
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // result er "data:<mime>;base64,XXXX" - vi vil kun have XXXX
        const result = reader.result;
        const commaIdx = result.indexOf(",");
        resolve(result.slice(commaIdx + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function base64ToBlob(b64, mimeType) {
    const bytes = base64ToBuf(b64);
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  }

  /**
   * Hoejniveau-funktion til at oprette en paste: genererer noegle,
   * krypterer indhold (tekst + evt. en vedhaeftet fil) som EN samlet
   * payload, og laegger evt. et password-lag ovenpaa.
   *
   * file (valgfri): { name, mimeType, dataB64 }
   */
  async function encryptForPaste(plaintext, password, file) {
    const keyStr = await generateKeyString();
    const contentKey = await importKeyFromString(keyStr);

    const payload = JSON.stringify({
      text: plaintext,
      file: file ? { name: file.name, mimeType: file.mimeType, data: file.dataB64 } : null,
    });

    const inner = await encrypt(payload, contentKey);

    if (!password) {
      return { ciphertext: inner.ciphertext, iv: inner.iv, salt: null, keyStr, passwordProtected: false };
    }

    // Adgangskode-lag: pak ciphertext+iv ind i en lille JSON-konvolut og
    // krypter HELE konvolutten med en noegle udledt fra passwordet.
    // Saa selv hvis nogen gaetter URL-noeglen, skal de ogsaa kende
    // passwordet for at komme videre.
    const envelope = JSON.stringify({ c: inner.ciphertext, i: inner.iv });
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const passwordKey = await deriveKeyFromPassword(password, salt);
    const wrapped = await encrypt(envelope, passwordKey);

    return {
      ciphertext: wrapped.ciphertext,
      iv: wrapped.iv,
      salt: bufToBase64(salt),
      keyStr,
      passwordProtected: true,
    };
  }

  /**
   * Hoejniveau-funktion til at dekryptere en hentet paste.
   * Returnerer { text, file } hvor file er null hvis der ikke var en vedhaeftning.
   */
  async function decryptPaste({ ciphertext, iv, salt }, keyStr, password) {
    const contentKey = await importKeyFromString(keyStr);

    let payloadJson;
    if (!salt) {
      payloadJson = await decrypt(ciphertext, iv, contentKey);
    } else {
      const saltBytes = base64ToBuf(salt);
      const passwordKey = await deriveKeyFromPassword(password, saltBytes);
      const envelopeJson = await decrypt(ciphertext, iv, passwordKey);
      const envelope = JSON.parse(envelopeJson);
      payloadJson = await decrypt(envelope.c, envelope.i, contentKey);
    }

    return JSON.parse(payloadJson);
  }

  return {
    generateKeyString,
    importKeyFromString,
    encrypt,
    decrypt,
    encryptForPaste,
    decryptPaste,
    fileToBase64,
    base64ToBlob,
  };
})();
