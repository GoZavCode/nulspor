// smtp.js
//
// SMTP-server der modtager indkommende mail til *@DOMAIN. Lytter
// normalt paa port 25 i produktion (kraever root/cap_net_bind_service
// paa Linux, da porte under 1024 er beskyttede).
//
// Sikkerhedsprincipper:
//  - Afviser mail til adresser der ikke findes eller er udloebet,
//    FOER vi accepterer beskeden (saa vi ikke gemmer mail vi ikke kan
//    bruge, og ikke bliver et "open relay" for ukendte adresser).
//  - Begraenser besked-stoerrelse haardt, saa store/ondsindede
//    beskeder ikke kan fylde disken eller hukommelsen op.
//  - HTML-indhold konverteres til ren tekst ved modtagelse, saa
//    tracking-pixels, scripts og andet HTML-baseret aldrig gemmes
//    eller vises. Dette er en design-garanti, ikke kun en UI-feature.
//  - Vi sender ikke mail ud (intet relay), kun modtager.

import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { customAlphabet } from "nanoid";

import { getMailAddress, insertMailMessage } from "./db.js";

const genId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 12);

const MAIL_DOMAIN = process.env.MAIL_DOMAIN || "nulspor.dk";
const SMTP_PORT = Number(process.env.SMTP_PORT || 25);
const MAX_MESSAGE_BYTES = Number(process.env.MAX_MAIL_SIZE_MB || 10) * 1024 * 1024;
const MAX_INBOX_MESSAGES = Number(process.env.MAX_INBOX_MESSAGES || 50);

function normalizeAddress(addr) {
  return (addr || "").trim().toLowerCase();
}

function createSmtpServer() {
  const server = new SMTPServer({
    banner: "Nulspor Mail",
    size: MAX_MESSAGE_BYTES,
    disabledCommands: ["AUTH"], // vi modtager kun, ingen login-flow noedvendig
    authOptional: true,

    // Afviser afsendere/modtagere foer selve beskeden overhovedet
    // overfoeres, hvis modtager-adressen ikke er en gyldig, aktiv
    // Nulspor Mail-adresse.
    onMailFrom(_address, _session, callback) {
      callback(); // vi filtrerer ikke paa afsender, kun paa modtager
    },

    onRcptTo(address, _session, callback) {
      const to = normalizeAddress(address.address);
      const [, domain] = to.split("@");

      if (domain !== MAIL_DOMAIN) {
        return callback(new Error("553 Forkert domaene"));
      }

      const entry = getMailAddress(to);
      if (!entry || entry.expiresAt < Date.now()) {
        return callback(new Error("550 Postkassen findes ikke eller er udloebet"));
      }

      callback();
    },

    onData(stream, session, callback) {
      let totalBytes = 0;
      let aborted = false;

      stream.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_MESSAGE_BYTES && !aborted) {
          aborted = true;
          stream.destroy();
        }
      });

      simpleParser(stream)
        .then(async (parsed) => {
          if (aborted) {
            return callback(new Error("552 Beskeden er for stor"));
          }

          const recipients = (session.envelope.rcptTo || []).map((r) => normalizeAddress(r.address));

          for (const to of recipients) {
            const entry = getMailAddress(to);
            if (!entry || entry.expiresAt < Date.now()) continue; // dobbelt-tjek, postkassen kan vaere udloebet siden RCPT TO

            const textBody = extractPlainText(parsed);

            insertMailMessage({
              id: genId(),
              address: to,
              fromAddress: parsed.from?.text || "ukendt afsender",
              subject: parsed.subject || "(intet emne)",
              textBody: truncate(textBody, 50000), // graense for at undgaa enorme beskeder i UI
              receivedAt: Date.now(),
            });

            console.log(`Mail modtaget til ${to} fra ${parsed.from?.text || "ukendt"}`);
          }

          callback();
        })
        .catch((err) => {
          console.error("Fejl ved parsing af indkommende mail:", err.message);
          callback(new Error("451 Kunne ikke behandle beskeden"));
        });
    },
  });

  return server;
}

// Udtraekker ren tekst fra en parset mail. HVIS mailen har et
// HTML-body, bruger vi ALTID vores egen stripHtml() paa den raa HTML,
// fremfor mailparsers indbyggede text-konvertering. Det er bevidst:
// mailparsers automatiske html->text konvertering bevarer billed- og
// link-URL'er i firkantede parenteser (f.eks. til tracking-pixel
// URL'er), hvilket vi ikke vil have i den gemte besked. Vores egen
// stripHtml() fjerner img/script/style-tags fuldstaendigt i stedet
// for at vise deres URL'er som tekst.
function extractPlainText(parsed) {
  if (parsed.html) {
    return stripHtml(parsed.html);
  }

  if (parsed.text && parsed.text.trim()) {
    return parsed.text.trim();
  }

  return "(Denne mail har intet laesbart tekstindhold.)";
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<img[^>]*>/gi, "") // fjern billeder helt, inkl. tracking-pixel URL'er - vis ikke URL'en som tekst
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)") // bevar link-tekst + URL i synlig form, i stedet for at goemme URL'en i et separat klamme-format
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(str, maxLength) {
  if (!str) return str;
  return str.length > maxLength ? str.slice(0, maxLength) + "\n\n[...afkortet, beskeden var for lang]" : str;
}

function startSmtpServer() {
  const server = createSmtpServer();
  server.on("error", (err) => {
    console.error(`SMTP-server fejl (port ${SMTP_PORT}): ${err.message}`);
    if (err.code === "EACCES") {
      console.error(
        `Tip: port ${SMTP_PORT} kraever typisk root/cap_net_bind_service paa Linux. ` +
          `Saet SMTP_PORT til en port over 1024 til udvikling, eller koer med tilstraekkelige rettigheder i produktion.`
      );
    }
  });
  server.listen(SMTP_PORT, () => {
    console.log(`Nulspor Mail SMTP-server lytter på port ${SMTP_PORT} for @${MAIL_DOMAIN}`);
  });
  return server;
}

export { createSmtpServer, startSmtpServer, MAIL_DOMAIN, MAX_INBOX_MESSAGES };
