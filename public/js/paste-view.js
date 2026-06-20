// paste-view.js

const pasteId = window.location.pathname.split("/paste/")[1];
const keyStr = window.location.hash.slice(1); // alt efter # - sendes ALDRIG til serveren

const viewLoading = document.getElementById("view-loading");
const viewNoKey = document.getElementById("view-nokey");
const viewNotFound = document.getElementById("view-notfound");
const viewPassword = document.getElementById("view-password");
const viewContent = document.getElementById("view-content");

const passwordInput = document.getElementById("passwordInput");
const passwordError = document.getElementById("passwordError");
const unlockBtn = document.getElementById("unlockBtn");

const syntaxBadge = document.getElementById("syntaxBadge");
const burnBadge = document.getElementById("burnBadge");
const pasteCode = document.getElementById("pasteCode");
const pasteCodeBlock = document.getElementById("pasteCodeBlock");

const fileAttachmentBox = document.getElementById("fileAttachmentBox");
const fileAttachmentName = document.getElementById("fileAttachmentName");
const fileAttachmentSize = document.getElementById("fileAttachmentSize");
const fileAttachmentLink = document.getElementById("fileAttachmentLink");

function showView(view) {
  [viewLoading, viewNoKey, viewNotFound, viewPassword, viewContent].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

const SYNTAX_LABELS = {
  javascript: "JavaScript",
  python: "Python",
  html: "HTML",
  css: "CSS",
  bash: "Bash / shell",
  json: "JSON",
  sql: "SQL",
  markdown: "Markdown",
};

let pasteData = null;

async function init() {
  if (!keyStr) {
    showView(viewNoKey);
    return;
  }

  try {
    const res = await fetch(`/api/paste/${pasteId}`);
    if (!res.ok) {
      showView(viewNotFound);
      return;
    }
    pasteData = await res.json();

    if (pasteData.passwordProtected) {
      showView(viewPassword);
    } else {
      await renderContent(null);
    }
  } catch (err) {
    console.error(err);
    showView(viewNotFound);
  }
}

async function renderContent(password) {
  try {
    const payload = await NULSPOR_CRYPTO.decryptPaste(
      { ciphertext: pasteData.ciphertext, iv: pasteData.iv, salt: pasteData.salt },
      keyStr,
      password
    );

    const syntax = pasteData.syntaxMode;
    syntaxBadge.textContent = syntax ? SYNTAX_LABELS[syntax] || syntax : "Almindelig tekst";

    if (pasteData.burnAfterReading) {
      burnBadge.hidden = false;
    }

    if (payload.text) {
      pasteCode.textContent = payload.text;
      if (syntax && window.hljs) {
        pasteCode.className = `language-${syntax}`;
        window.hljs.highlightElement(pasteCode);
      }
      pasteCodeBlock.hidden = false;
    } else {
      pasteCodeBlock.hidden = true;
    }

    if (payload.file) {
      renderFileAttachment(payload.file);
    }

    showView(viewContent);
  } catch (err) {
    console.error(err);
    if (pasteData.passwordProtected) {
      passwordError.textContent = "Forkert adgangskode, eller indholdet kunne ikke dekrypteres.";
      passwordError.hidden = false;
    } else {
      showView(viewNotFound);
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFileAttachment(file) {
  const blob = NULSPOR_CRYPTO.base64ToBlob(file.data, file.mimeType);
  const url = URL.createObjectURL(blob);

  fileAttachmentName.textContent = file.name;
  fileAttachmentSize.textContent = formatBytes(blob.size);
  fileAttachmentLink.href = url;
  fileAttachmentLink.download = file.name;
  fileAttachmentBox.hidden = false;
}

unlockBtn.addEventListener("click", () => {
  passwordError.hidden = true;
  renderContent(passwordInput.value);
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockBtn.click();
});

init();
