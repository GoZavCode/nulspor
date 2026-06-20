// del-download.js

const fileId = window.location.pathname.split("/del/f/")[1];

const viewLoading = document.getElementById("view-loading");
const viewNotFound = document.getElementById("view-notfound");
const viewFile = document.getElementById("view-file");

const fileName = document.getElementById("fileName");
const fileMeta = document.getElementById("fileMeta");
const passwordGate = document.getElementById("passwordGate");
const passwordInput = document.getElementById("passwordInput");
const downloadBtn = document.getElementById("downloadBtn");

const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const errorDismiss = document.getElementById("errorDismiss");

errorDismiss.addEventListener("click", () => (errorBanner.hidden = true));

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
  clearTimeout(errorBanner._timeout);
  errorBanner._timeout = setTimeout(() => (errorBanner.hidden = true), 6000);
}

function showView(view) {
  [viewLoading, viewNotFound, viewFile].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

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

async function loadFileInfo() {
  try {
    const res = await fetch(`/api/share/file/${fileId}`);
    if (!res.ok) {
      showView(viewNotFound);
      return;
    }
    const data = await res.json();

    fileName.textContent = data.originalName;
    fileMeta.textContent = `${formatBytes(data.size)} · udløber ${formatDate(data.expiresAt)}`;

    if (data.requiresPassword) {
      passwordGate.hidden = false;
    }

    showView(viewFile);
  } catch {
    showView(viewNotFound);
  }
}

downloadBtn.addEventListener("click", async () => {
  downloadBtn.textContent = "Henter...";
  downloadBtn.disabled = true;

  try {
    const res = await fetch(`/api/share/file/${fileId}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput?.value || "" }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || "Download mislykkedes.");
      downloadBtn.textContent = "Download fil";
      downloadBtn.disabled = false;
      return;
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? decodeURIComponent(match[1]) : fileName.textContent;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    downloadBtn.textContent = "Download fil";
    downloadBtn.disabled = false;
  } catch {
    showError("Netværksfejl. Prøv igen.");
    downloadBtn.textContent = "Download fil";
    downloadBtn.disabled = false;
  }
});

loadFileInfo();
