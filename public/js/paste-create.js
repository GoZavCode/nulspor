// paste-create.js

const contentInput = document.getElementById("contentInput");
const syntaxSelect = document.getElementById("syntaxSelect");
const expirySelect = document.getElementById("expirySelect");
const passwordInput = document.getElementById("passwordInput");
const burnCheckbox = document.getElementById("burnCheckbox");
const createBtn = document.getElementById("createBtn");

const fileInput = document.getElementById("fileInput");
const fileAttachBtn = document.getElementById("fileAttachBtn");
const fileAttachLabel = document.getElementById("fileAttachLabel");
const fileRemoveBtn = document.getElementById("fileRemoveBtn");

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
let selectedFile = null;

const viewEditor = document.getElementById("view-editor");
const viewResult = document.getElementById("view-result");

const resultLink = document.getElementById("resultLink");
const resultMeta = document.getElementById("resultMeta");
const copyBtn = document.getElementById("copyBtn");
const newPasteBtn = document.getElementById("newPasteBtn");

const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const errorDismiss = document.getElementById("errorDismiss");

errorDismiss.addEventListener("click", () => (errorBanner.hidden = true));

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

fileAttachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > MAX_ATTACHMENT_BYTES) {
    showError(`Filen er for stor. Maks er ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    fileInput.value = "";
    return;
  }

  selectedFile = file;
  fileAttachLabel.textContent = `${file.name} (${formatBytes(file.size)})`;
  fileAttachBtn.classList.add("has-file");
  fileRemoveBtn.hidden = false;
});

fileRemoveBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileAttachLabel.textContent = "Vedhæft en fil (valgfri, maks 10 MB)";
  fileAttachBtn.classList.remove("has-file");
  fileRemoveBtn.hidden = true;
});

createBtn.addEventListener("click", async () => {
  const plaintext = contentInput.value;

  if (!plaintext.trim() && !selectedFile) {
    showError("Skriv noget indhold eller vedhæft en fil før du opretter en paste.");
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = "Krypterer...";
  errorBanner.hidden = true;

  try {
    const password = passwordInput.value || null;

    let fileForEncryption = null;
    if (selectedFile) {
      const dataB64 = await NULSPOR_CRYPTO.fileToBase64(selectedFile);
      fileForEncryption = { name: selectedFile.name, mimeType: selectedFile.type, dataB64 };
    }

    const encrypted = await NULSPOR_CRYPTO.encryptForPaste(plaintext, password, fileForEncryption);

    const res = await fetch("/api/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        passwordProtected: encrypted.passwordProtected,
        burnAfterReading: burnCheckbox.checked,
        syntaxMode: syntaxSelect.value === "plain" ? null : syntaxSelect.value,
        expiry: expirySelect.value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Der gik noget galt under oprettelse.");
      createBtn.disabled = false;
      createBtn.textContent = "Krypter og opret link";
      return;
    }

    const link = `${window.location.origin}/paste/${data.id}#${encrypted.keyStr}`;
    resultLink.value = link;

    const parts = [];
    if (data.expiresAt) parts.push(`udløber ${formatDate(data.expiresAt)}`);
    if (burnCheckbox.checked) parts.push("slettes efter første visning");
    if (encrypted.passwordProtected) parts.push("adgangskodebeskyttet");
    if (selectedFile) parts.push(`fil vedhæftet (${formatBytes(selectedFile.size)})`);
    resultMeta.textContent = parts.join(" · ") || "Ingen automatisk udløb.";

    viewEditor.hidden = true;
    viewResult.hidden = false;
  } catch (err) {
    console.error(err);
    showError("Kryptering mislykkedes. Prøv igen.");
    createBtn.disabled = false;
    createBtn.textContent = "Krypter og opret link";
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultLink.value);
    copyBtn.textContent = "Kopieret ✓";
    setTimeout(() => (copyBtn.textContent = "Kopiér"), 2000);
  } catch {
    resultLink.select();
  }
});

newPasteBtn.addEventListener("click", () => {
  contentInput.value = "";
  passwordInput.value = "";
  burnCheckbox.checked = false;
  syntaxSelect.value = "plain";
  expirySelect.value = "1d";
  selectedFile = null;
  fileInput.value = "";
  fileAttachLabel.textContent = "Vedhæft en fil (valgfri, maks 10 MB)";
  fileAttachBtn.classList.remove("has-file");
  fileRemoveBtn.hidden = true;
  createBtn.disabled = false;
  createBtn.textContent = "Krypter og opret link";
  viewResult.hidden = true;
  viewEditor.hidden = false;
});
