// mail.js

const STORAGE_KEY = "nulspor_mail_inbox";

const viewCreate = document.getElementById("view-create");
const viewInbox = document.getElementById("view-inbox");
const viewMessage = document.getElementById("view-message");

const quickCreateBtn = document.getElementById("quickCreateBtn");
const customToggleBtn = document.getElementById("customToggleBtn");
const customRow = document.getElementById("customRow");
const customLocalPart = document.getElementById("customLocalPart");
const domainLabel = document.getElementById("domainLabel");
const availabilityIndicator = document.getElementById("availabilityIndicator");
const expirySelect = document.getElementById("expirySelect");
const createBtn = document.getElementById("createBtn");

const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const errorDismiss = document.getElementById("errorDismiss");

const inboxAddress = document.getElementById("inboxAddress");
const inboxMeta = document.getElementById("inboxMeta");
const copyAddressBtn = document.getElementById("copyAddressBtn");
const refreshBtn = document.getElementById("refreshBtn");
const inboxStatus = document.getElementById("inboxStatus");
const inboxList = document.getElementById("inboxList");
const inboxEmpty = document.getElementById("inboxEmpty");
const newAddressBtn = document.getElementById("newAddressBtn");

const backToInboxBtn = document.getElementById("backToInboxBtn");
const messageSubject = document.getElementById("messageSubject");
const messageFrom = document.getElementById("messageFrom");
const messageDate = document.getElementById("messageDate");
const messageBody = document.getElementById("messageBody");

let currentInbox = null; // { address, inboxToken, expiresAt }
let pollTimer = null;
let knownMessageIds = new Set();

function showView(view) {
  [viewCreate, viewInbox, viewMessage].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
  clearTimeout(errorBanner._timeout);
  errorBanner._timeout = setTimeout(() => (errorBanner.hidden = true), 6000);
}

errorDismiss.addEventListener("click", () => (errorBanner.hidden = true));

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeExpiry(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "udløbet";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `udløber om ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `udløber om ${hours} timer`;
  const days = Math.round(hours / 24);
  return `udløber om ${days} dage`;
}

function saveInbox(inbox) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inbox));
}

function loadSavedInbox() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function clearSavedInbox() {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Custom adresse toggle + tilgaengelighedstjek ---
customToggleBtn.addEventListener("click", () => {
  customRow.hidden = false;
  createBtn.hidden = false;
  quickCreateBtn.hidden = true;
  customToggleBtn.hidden = true;
  customLocalPart.focus();
});

let availabilityTimeout = null;
customLocalPart.addEventListener("input", () => {
  const value = customLocalPart.value.trim().toLowerCase();
  clearTimeout(availabilityTimeout);

  if (!value) {
    availabilityIndicator.textContent = "";
    return;
  }

  availabilityIndicator.textContent = "tjekker...";
  availabilityIndicator.className = "availability-indicator";

  availabilityTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/mail/address/${encodeURIComponent(value)}/available`);
      const data = await res.json();
      if (data.available) {
        availabilityIndicator.textContent = "✓ ledig";
        availabilityIndicator.className = "availability-indicator is-available";
      } else {
        availabilityIndicator.textContent = "✕ optaget";
        availabilityIndicator.className = "availability-indicator is-taken";
      }
    } catch {
      availabilityIndicator.textContent = "";
    }
  }, 400);
});

// --- Opret adresse ---
async function createAddress(customLocalPartValue) {
  errorBanner.hidden = true;
  const body = { expiry: expirySelect.value };
  if (customLocalPartValue) body.customLocalPart = customLocalPartValue;

  try {
    const res = await fetch("/api/mail/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Kunne ikke oprette adressen.");
      return;
    }

    currentInbox = { address: data.address, inboxToken: data.inboxToken, expiresAt: data.expiresAt };
    saveInbox(currentInbox);
    knownMessageIds = new Set();
    enterInboxView();
  } catch (err) {
    console.error(err);
    showError("Netværksfejl. Prøv igen.");
  }
}

quickCreateBtn.addEventListener("click", () => createAddress(null));
createBtn.addEventListener("click", () => {
  const value = customLocalPart.value.trim().toLowerCase();
  if (!value) {
    showError("Skriv en adresse, eller brug 'Opret tilfældig adresse' i stedet.");
    return;
  }
  createAddress(value);
});

// --- Inbox view ---
function enterInboxView() {
  inboxAddress.textContent = currentInbox.address;
  updateInboxMeta();
  showView(viewInbox);
  refreshInbox();
  startPolling();
}

function updateInboxMeta() {
  inboxMeta.textContent = `Oprettet ${formatDate(Date.now())} · ${formatRelativeExpiry(currentInbox.expiresAt)}`;
}

copyAddressBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentInbox.address);
    copyAddressBtn.textContent = "Kopieret ✓";
    setTimeout(() => (copyAddressBtn.textContent = "Kopiér"), 2000);
  } catch {
    // ignorer - clipboard kan vaere blokeret, ikke kritisk
  }
});

async function refreshInbox() {
  if (!currentInbox) return;
  inboxStatus.textContent = "Opdaterer...";

  try {
    const res = await fetch(`/api/mail/address/${encodeURIComponent(currentInbox.address)}/messages`, {
      headers: { "X-Inbox-Token": currentInbox.inboxToken },
    });

    if (res.status === 404 || res.status === 403) {
      // Postkassen er udloebet eller token er ugyldigt - ryd op og start forfra
      clearSavedInbox();
      currentInbox = null;
      stopPolling();
      showView(viewCreate);
      showError("Din postkasse er udløbet. Opret en ny.");
      return;
    }

    const data = await res.json();
    renderInboxList(data.messages);
    inboxStatus.textContent = `Sidst opdateret ${new Date().toLocaleTimeString("da-DK")}`;
  } catch (err) {
    console.error(err);
    inboxStatus.textContent = "Kunne ikke opdatere.";
  }
}

function renderInboxList(messages) {
  inboxList.innerHTML = "";

  if (!messages.length) {
    inboxList.appendChild(inboxEmpty);
    return;
  }

  for (const msg of messages) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "inbox-item";
    item.innerHTML = `
      <span class="inbox-item-subject"></span>
      <span class="inbox-item-meta">
        <span class="inbox-item-from"></span>
        <span></span>
      </span>
    `;
    item.querySelector(".inbox-item-subject").textContent = msg.subject || "(intet emne)";
    item.querySelector(".inbox-item-from").textContent = msg.fromAddress || "ukendt afsender";
    item.querySelector(".inbox-item-meta > span:last-child").textContent = formatDate(msg.receivedAt);
    item.addEventListener("click", () => openMessage(msg.id));
    inboxList.appendChild(item);
  }
}

refreshBtn.addEventListener("click", refreshInbox);

function startPolling() {
  stopPolling();
  pollTimer = setInterval(refreshInbox, 15000); // poll hvert 15. sekund
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

newAddressBtn.addEventListener("click", () => {
  clearSavedInbox();
  currentInbox = null;
  stopPolling();
  customRow.hidden = true;
  createBtn.hidden = true;
  quickCreateBtn.hidden = false;
  customToggleBtn.hidden = false;
  customLocalPart.value = "";
  availabilityIndicator.textContent = "";
  showView(viewCreate);
});

// --- Message detail ---
async function openMessage(id) {
  try {
    const res = await fetch(
      `/api/mail/address/${encodeURIComponent(currentInbox.address)}/messages/${id}`,
      { headers: { "X-Inbox-Token": currentInbox.inboxToken } }
    );
    if (!res.ok) {
      showError("Kunne ikke hente beskeden.");
      return;
    }
    const msg = await res.json();

    messageSubject.textContent = msg.subject || "(intet emne)";
    messageFrom.textContent = `Fra: ${msg.fromAddress || "ukendt afsender"}`;
    messageDate.textContent = formatDate(msg.receivedAt);
    messageBody.textContent = msg.textBody || "(ingen tekst)";

    showView(viewMessage);
  } catch (err) {
    console.error(err);
    showError("Netværksfejl.");
  }
}

backToInboxBtn.addEventListener("click", () => showView(viewInbox));

// --- Init: genindlaes evt. gemt postkasse ---
const saved = loadSavedInbox();
if (saved) {
  currentInbox = saved;
  enterInboxView();
} else {
  showView(viewCreate);
}
