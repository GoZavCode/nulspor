// del-upload.js

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");

const viewUpload = document.getElementById("view-upload");
const viewProgress = document.getElementById("view-progress");
const viewReceipt = document.getElementById("view-receipt");

const progressFill = document.getElementById("progressFill");
const progressFilename = document.getElementById("progressFilename");
const progressLabel = document.getElementById("progressLabel");

const receiptFilename = document.getElementById("receiptFilename");
const receiptMeta = document.getElementById("receiptMeta");
const receiptLink = document.getElementById("receiptLink");
const receiptExpiry = document.getElementById("receiptExpiry");
const copyButton = document.getElementById("copyButton");
const uploadAnotherBtn = document.getElementById("uploadAnotherBtn");

const passwordInput = document.getElementById("passwordInput");
const expirySelect = document.getElementById("expirySelect");

const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const errorDismiss = document.getElementById("errorDismiss");

function showView(view) {
  [viewUpload, viewProgress, viewReceipt].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
  clearTimeout(errorBanner._timeout);
  errorBanner._timeout = setTimeout(() => (errorBanner.hidden = true), 6000);
}

errorDismiss.addEventListener("click", () => (errorBanner.hidden = true));

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

dropzone.addEventListener("click", () => fileInput.click());
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) uploadFile(file);
});

function uploadFile(file) {
  showView(viewProgress);
  progressLabel.textContent = "Uploader...";
  progressFilename.textContent = `${file.name} · ${formatBytes(file.size)}`;
  progressFill.style.width = "0%";

  const formData = new FormData();
  formData.append("file", file);
  if (passwordInput.value) formData.append("password", passwordInput.value);
  formData.append("expiryDays", expirySelect.value);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/share/upload");

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressLabel.textContent = pct < 100 ? `Uploader... ${pct}%` : "Færdiggør...";
    }
  });

  xhr.addEventListener("load", () => {
    let data;
    try {
      data = JSON.parse(xhr.responseText);
    } catch {
      data = null;
    }

    if (xhr.status >= 200 && xhr.status < 300 && data) {
      showReceipt(file, data);
    } else {
      showView(viewUpload);
      showError(data?.error || "Upload mislykkedes. Prøv igen.");
    }
  });

  xhr.addEventListener("error", () => {
    showView(viewUpload);
    showError("Netværksfejl under upload. Prøv igen.");
  });

  xhr.send(formData);
}

function showReceipt(file, data) {
  receiptFilename.textContent = file.name;
  receiptMeta.textContent = `${formatBytes(file.size)}${passwordInput.value ? " · adgangskodebeskyttet" : ""}`;
  const fullLink = `${window.location.origin}${data.link}`;
  receiptLink.value = fullLink;
  receiptExpiry.textContent = `Slettes automatisk ${formatDate(data.expiresAt)}.`;
  showView(viewReceipt);
}

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(receiptLink.value);
    copyButton.textContent = "Kopieret ✓";
    setTimeout(() => (copyButton.textContent = "Kopiér"), 2000);
  } catch {
    receiptLink.select();
    showError("Kunne ikke kopiere automatisk. Markeret til manuel kopiering.");
  }
});

uploadAnotherBtn.addEventListener("click", () => {
  fileInput.value = "";
  passwordInput.value = "";
  expirySelect.value = "7";
  showView(viewUpload);
});
