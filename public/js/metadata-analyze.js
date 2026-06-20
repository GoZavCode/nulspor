// metadata-analyze.js
//
// Samler analyse-logikken: tager en fil, finder ud af hvilken
// analysator der skal bruges (JPEG/PNG via exifr+vores strippere,
// PDF via pdf-lib), og returnerer en ensartet struktur af "felter"
// til UI'en at vise, samt en risikovurdering.

window.NULSPOR_METADATA = (() => {
  // Felter der betragtes som hoej-risiko (kan afsloere lokation eller
  // praecis enheds-identitet)
  const HIGH_RISK_FIELDS = new Set(["GPSLatitude", "GPSLongitude", "GPS-koordinater"]);
  const MEDIUM_RISK_FIELDS = new Set([
    "Make", "Model", "Producent", "Kameramodel", "Telefonmodel",
    "Software", "Creator", "Producer", "Forfatter", "Author",
  ]);

  function detectFileType(file) {
    const name = file.name.toLowerCase();
    if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpeg";
    if (file.type === "image/png" || name.endsWith(".png")) return "png";
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    return null;
  }

  async function readFileBytes(file) {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Analyserer en JPEG-fil og returnerer en liste af menneskelaesbare felter.
   */
  async function analyzeJpeg(bytes) {
    const exif = await window.exifr.parse(bytes, { gps: true, exif: true, ifd0: true, translateValues: true });
    const fields = [];

    if (!exif) return fields;

    if (exif.latitude != null && exif.longitude != null) {
      fields.push({
        key: "GPSLatitude",
        label: "GPS-koordinater",
        value: `${exif.latitude.toFixed(6)}, ${exif.longitude.toFixed(6)}`,
        explanation: "Afslører præcis hvor billedet blev taget, ofte ned til den nøjagtige adresse.",
      });
    }
    if (exif.Make) fields.push({ key: "Make", label: "Producent", value: String(exif.Make), explanation: "Afslører hvilket mærke kamera eller telefon der blev brugt." });
    if (exif.Model) fields.push({ key: "Model", label: "Kamera-/telefonmodel", value: String(exif.Model), explanation: "Afslører den præcise model af enheden, som kan kombineres med andre spor til at identificere dig." });
    if (exif.Software) fields.push({ key: "Software", label: "Redigeringssoftware", value: String(exif.Software), explanation: "Viser hvilket program billedet er redigeret eller eksporteret med." });
    if (exif.DateTimeOriginal) fields.push({ key: "DateTimeOriginal", label: "Oprettelsesdato", value: formatDate(exif.DateTimeOriginal), explanation: "Afslører det præcise tidspunkt billedet blev taget." });
    if (exif.ModifyDate) fields.push({ key: "ModifyDate", label: "Redigeringsdato", value: formatDate(exif.ModifyDate), explanation: "Afslører hvornår billedet sidst blev redigeret." });

    return fields;
  }

  /**
   * Analyserer en PNG-fil for tekstuel metadata (Author, Comment, osv.)
   */
  function analyzePng(bytes) {
    const textFields = window.NULSPOR_PNG.readTextMetadata(bytes);
    const fields = [];

    for (const [key, value] of Object.entries(textFields)) {
      fields.push({
        key,
        label: key,
        value: String(value),
        explanation: "Tekstuelle metadata-felter kan indeholde navne, kommentarer eller software-information, som ofte er tilføjet uden brugerens viden.",
      });
    }

    return fields;
  }

  /**
   * Analyserer en PDF-fil for dokument-metadata via pdf-lib.
   */
  async function analyzePdf(bytes) {
    const pdfDoc = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const fields = [];

    const title = pdfDoc.getTitle();
    const author = pdfDoc.getAuthor();
    const subject = pdfDoc.getSubject();
    const creator = pdfDoc.getCreator();
    const producer = pdfDoc.getProducer();
    const created = pdfDoc.getCreationDate();
    const modified = pdfDoc.getModificationDate();

    if (title) fields.push({ key: "Title", label: "Titel", value: title, explanation: "Dokumentets gemte titel, som kan afsløre indholdet selv hvis filnavnet er anonymiseret." });
    if (author) fields.push({ key: "Author", label: "Forfatter", value: author, explanation: "Navnet på den person eller konto, der oprettede dokumentet." });
    if (subject) fields.push({ key: "Subject", label: "Emne", value: subject, explanation: "Et beskrivende emnefelt, ofte sat automatisk af kontorsoftware." });
    if (creator) fields.push({ key: "Creator", label: "Oprettet med", value: creator, explanation: "Programmet dokumentet oprindeligt blev skabt i, f.eks. Word eller InDesign." });
    if (producer) {
      fields.push({
        key: "Producer",
        label: "Producer-software",
        value: producer,
        explanation: "Programmet der konverterede dokumentet til PDF. Bemærk: efter rensning vil dette felt altid vise navnet på det renseværktøj, der blev brugt, ikke fjernes helt, da det er en del af PDF-formatets struktur.",
        structural: true,
      });
    }
    if (created && created.getTime() !== 0) {
      fields.push({ key: "CreationDate", label: "Oprettelsesdato", value: formatDate(created), explanation: "Det præcise tidspunkt dokumentet blev oprettet." });
    }
    if (modified) {
      fields.push({
        key: "ModDate",
        label: "Redigeringsdato",
        value: formatDate(modified),
        explanation: "Det præcise tidspunkt dokumentet sidst blev gemt. Bemærk: dette felt sættes altid til rensningstidspunktet efter behandling, det kan ikke fjernes helt, men det skjuler i praksis det oprindelige redigeringstidspunkt.",
        structural: true,
      });
    }

    fields.push({
      key: "PDFVersion",
      label: "PDF-version",
      value: pdfDoc.context?.header ? `${pdfDoc.context.header.major}.${pdfDoc.context.header.minor}` : "ukendt",
      explanation: "Den tekniske PDF-version. Ikke personligt afslørende, men vises for fuldstændighedens skyld.",
      lowRisk: true,
    });

    return fields;
  }

  function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return String(date);
    return date.toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function classifyRisk(fields) {
    const hasHigh = fields.some((f) => HIGH_RISK_FIELDS.has(f.key) || HIGH_RISK_FIELDS.has(f.label));
    if (hasHigh) return "high";

    const mediumCount = fields.filter((f) => MEDIUM_RISK_FIELDS.has(f.key) || MEDIUM_RISK_FIELDS.has(f.label)).length;
    if (mediumCount >= 3) return "high";
    if (mediumCount >= 1) return "medium";
    if (fields.length > 0) return "medium";
    return "low";
  }

  /**
   * Hovedfunktion: analyserer en File og returnerer
   * { fileType, fields, risk, dimensions? }
   */
  async function analyzeFile(file) {
    const fileType = detectFileType(file);
    if (!fileType) {
      throw new Error("Filtypen understøttes ikke. Vi understøtter JPG, PNG og PDF.");
    }

    const bytes = await readFileBytes(file);
    let fields = [];

    if (fileType === "jpeg") {
      fields = await analyzeJpeg(bytes);
    } else if (fileType === "png") {
      fields = analyzePng(bytes);
    } else if (fileType === "pdf") {
      fields = await analyzePdf(bytes);
    }

    const risk = classifyRisk(fields.filter((f) => !f.lowRisk && !f.structural));

    return { fileType, fields, risk, bytes };
  }

  /**
   * Fjerner metadata fra en fils bytes, baseret paa filtype.
   * excludeKeys (valgfri): saet af keys der IKKE skal fjernes (bevares).
   */
  async function cleanFile(bytes, fileType, excludeKeys = new Set()) {
    if (fileType === "jpeg") {
      // Vores nuvaerende JPEG-stripper fjerner altid alt (APP1/APP13).
      // Selektiv bevarelse af enkeltfelter i JPEG kraever at gen-skrive
      // EXIF-segmentet med kun de valgte felter, hvilket vi ikke goer i
      // denne version - "fjern alt" er den eneste mulighed for JPEG.
      return window.NULSPOR_JPEG.stripMetadata(bytes);
    }

    if (fileType === "png") {
      return window.NULSPOR_PNG.stripMetadata(bytes);
    }

    if (fileType === "pdf") {
      const pdfDoc = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      if (!excludeKeys.has("Title")) pdfDoc.setTitle("");
      if (!excludeKeys.has("Author")) pdfDoc.setAuthor("");
      if (!excludeKeys.has("Subject")) pdfDoc.setSubject("");
      if (!excludeKeys.has("Creator")) pdfDoc.setCreator("");
      if (!excludeKeys.has("Producer")) pdfDoc.setProducer("");
      if (!excludeKeys.has("CreationDate")) pdfDoc.setCreationDate(new Date(0));
      // ModDate saettes altid til "nu" af pdf-lib ved save() - det er
      // oenskvaerdigt: det skjuler det oprindelige redigeringstidspunkt.
      return pdfDoc.save();
    }

    throw new Error("Ukendt filtype til rensning.");
  }

  return { analyzeFile, cleanFile, detectFileType };
})();
