// metadata-ui.js

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");

const viewUpload = document.getElementById("view-upload");
const viewAnalyzing = document.getElementById("view-analyzing");
const viewResult = document.getElementById("view-result");
const viewDone = document.getElementById("view-done");

const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const errorDismiss = document.getElementById("errorDismiss");

const riskBanner = document.getElementById("riskBanner");
const riskIndicator = document.getElementById("riskIndicator");
const riskTitle = document.getElementById("riskTitle");
const riskExplanation = document.getElementById("riskExplanation");

const resultFilename = document.getElementById("resultFilename");
const analyzeAnotherBtn = document.getElementById("analyzeAnotherBtn");

const fieldsList = document.getElementById("fieldsList");
const fieldsEmpty = document.getElementById("fieldsEmpty");
const selectAllRow = document.getElementById("selectAllRow");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const jpegNote = document.getElementById("jpegNote");
const infoFieldsCard = document.getElementById("infoFieldsCard");
const infoFieldsList = document.getElementById("infoFieldsList");

const cleanBtn = document.getElementById("cleanBtn");
const cleanErrorBanner = document.getElementById("cleanErrorBanner");
const cleanErrorText = document.getElementById("cleanErrorText");
const cleanErrorDismiss = document.getElementById("cleanErrorDismiss");

const doneNote = document.getElementById("doneNote");
const downloadCleanedBtn = document.getElementById("downloadCleanedBtn");
const doneAnotherBtn = document.getElementById("doneAnotherBtn");

let currentFile = null;
let currentAnalysis = null; // { fileType, fields, risk, bytes }
let lastDownloadUrl = null;

function showView(view) {
  [viewUpload, viewAnalyzing, viewResult, viewDone].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
}
errorDismiss.addEventListener("click", () => (errorBanner.hidden = true));

function showCleanError(message) {
  cleanErrorText.textContent = message;
  cleanErrorBanner.hidden = false;
}
cleanErrorDismiss.addEventListener("click", () => (cleanErrorBanner.hidden = true));

// --- Drag & drop ---
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
  if (file) handleFile(file);
});
dropzone.addEventListener("click", () => fileInput.click());
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

// --- Analyse ---
async function handleFile(file) {
  errorBanner.hidden = true;
  currentFile = file;
  showView(viewAnalyzing);

  try {
    const analysis = await NULSPOR_METADATA.analyzeFile(file);
    currentAnalysis = analysis;
    renderResult(file, analysis);
  } catch (err) {
    console.error(err);
    showView(viewUpload);
    showError(err.message || "Kunne ikke analysere filen.");
  }
}

const RISK_CONFIG = {
  low: {
    label: "Lav risiko",
    className: "risk-low",
    explanation: "Vi fandt ingen eller meget få oplysninger, der kan identificere dig eller stedet, filen blev skabt.",
  },
  medium: {
    label: "Moderat risiko",
    className: "risk-medium",
    explanation: "Filen indeholder oplysninger som kameramodel, software eller forfatter, som med fordel kan fjernes før deling.",
  },
  high: {
    label: "Høj risiko",
    className: "risk-high",
    explanation: "Denne fil indeholder GPS-koordinater eller flere identificerende oplysninger om den enhed, der oprettede den.",
  },
};

function renderResult(file, analysis) {
  resultFilename.textContent = file.name;

  const config = RISK_CONFIG[analysis.risk];
  riskBanner.className = `risk-banner ${config.className}`;
  riskTitle.textContent = config.label;
  riskExplanation.textContent = config.explanation;

  fieldsList.innerHTML = "";
  const realFields = analysis.fields.filter((f) => !f.lowRisk && !f.structural);
  const infoFields = analysis.fields.filter((f) => f.lowRisk || f.structural);

  if (realFields.length === 0) {
    fieldsEmpty.hidden = false;
    selectAllRow.hidden = true;
    cleanBtn.textContent = "Download fil (ingen metadata at fjerne)";
  } else {
    fieldsEmpty.hidden = true;
    cleanBtn.textContent = "Fjern valgte metadata og download";

    const isJpeg = analysis.fileType === "jpeg";
    selectAllRow.hidden = isJpeg; // JPEG har ikke individuelt valg, kun alt/intet
    jpegNote.hidden = !isJpeg;

    for (const field of realFields) {
      const row = document.createElement("div");
      row.className = "field-row";
      row.innerHTML = `
        <label class="field-checkbox-label">
          <input type="checkbox" class="field-checkbox" data-key="${field.key}" ${isJpeg ? "checked disabled" : "checked"} />
          <div class="field-row-content">
            <div class="field-row-top">
              <span class="field-label-text"></span>
              <span class="field-value-text"></span>
            </div>
            <p class="field-explanation"></p>
          </div>
        </label>
      `;
      row.querySelector(".field-label-text").textContent = field.label;
      row.querySelector(".field-value-text").textContent = field.value;
      row.querySelector(".field-explanation").textContent = field.explanation;
      fieldsList.appendChild(row);
    }
  }

  renderInfoFields(infoFields);

  showView(viewResult);
}

function renderInfoFields(infoFields) {
  infoFieldsList.innerHTML = "";
  infoFieldsCard.hidden = infoFields.length === 0;

  for (const field of infoFields) {
    const row = document.createElement("div");
    row.className = "info-field-row";
    row.innerHTML = `
      <div class="field-row-top">
        <span class="field-label-text"></span>
        <span class="field-value-text"></span>
      </div>
      <p class="field-explanation"></p>
    `;
    row.querySelector(".field-label-text").textContent = field.label;
    row.querySelector(".field-value-text").textContent = field.value;
    row.querySelector(".field-explanation").textContent = field.explanation;
    infoFieldsList.appendChild(row);
  }
}

selectAllCheckbox?.addEventListener("change", () => {
  const checkboxes = fieldsList.querySelectorAll(".field-checkbox");
  checkboxes.forEach((cb) => (cb.checked = selectAllCheckbox.checked));
});

analyzeAnotherBtn.addEventListener("click", resetToUpload);
doneAnotherBtn.addEventListener("click", resetToUpload);

function resetToUpload() {
  currentFile = null;
  currentAnalysis = null;
  fileInput.value = "";
  if (lastDownloadUrl) {
    URL.revokeObjectURL(lastDownloadUrl);
    lastDownloadUrl = null;
  }
  showView(viewUpload);
}

// --- Rensning ---
cleanBtn.addEventListener("click", async () => {
  if (!currentFile || !currentAnalysis) return;

  cleanErrorBanner.hidden = true;
  cleanBtn.disabled = true;
  cleanBtn.textContent = "Renser...";

  try {
    const checkboxes = fieldsList.querySelectorAll(".field-checkbox");
    const excludeKeys = new Set();
    checkboxes.forEach((cb) => {
      if (!cb.checked) excludeKeys.add(cb.dataset.key);
    });

    const cleanedBytes = await NULSPOR_METADATA.cleanFile(currentAnalysis.bytes, currentAnalysis.fileType, excludeKeys);

    const mimeType = currentFile.type || "application/octet-stream";
    const blob = new Blob([cleanedBytes], { type: mimeType });
    lastDownloadUrl = URL.createObjectURL(blob);

    downloadCleanedBtn.href = lastDownloadUrl;
    downloadCleanedBtn.download = buildCleanedFilename(currentFile.name);

    const removedCount = currentAnalysis.fields.length - excludeKeys.size;
    doneNote.textContent =
      removedCount > 0
        ? `${removedCount} metadata-felt${removedCount === 1 ? "" : "er"} blev fjernet. Filen er ellers uændret.`
        : "Filen blev behandlet uden ændringer i de valgte felter.";

    showView(viewDone);
  } catch (err) {
    console.error(err);
    showCleanError(err.message || "Kunne ikke rense filen.");
  } finally {
    cleanBtn.disabled = false;
    cleanBtn.textContent = "Fjern valgte metadata og download";
  }
});

function buildCleanedFilename(originalName) {
  const dotIdx = originalName.lastIndexOf(".");
  if (dotIdx === -1) return `${originalName}-renset`;
  return `${originalName.slice(0, dotIdx)}-renset${originalName.slice(dotIdx)}`;
}
