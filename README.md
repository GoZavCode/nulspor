# Nulspor

En dansk open source privacy-platform. Nulspor forklarer hvorfor digitalt
privatliv er vigtigt, og tilbyder praktiske værktøjer til at beskytte
det: sikker fildeling og ende-til-ende krypteret tekstdeling.

## Værktøjer

### Nulspor Deling
Upload og del filer uden konto eller login. Valgfri adgangskode,
automatisk udløb (1/7/30 dage), rate limiting mod misbrug.

### Nulspor Paste
Del tekst, noter og kode med ende-til-ende kryptering, inspireret af
[PrivateBin](https://privatebin.info). Serveren ser og gemmer kun
krypteret data, aldrig dit indhold eller din dekrypteringsnøgle.

### Nulspor Mail
Opret en midlertidig e-mailadresse med ét klik, uden konto eller
registrering. Brug den til tilmeldinger, downloads og steder du ikke
vil give din rigtige indbakke til. Adressen og alle dens mails slettes
automatisk efter den valgte periode (10 min / 1 time / 24 timer / 7
dage).

Modtagne mails konverteres altid til ren tekst ved modtagelse, uanset
om de oprindeligt var HTML. Det betyder at billeder, tracking-pixler,
scripts og styling aldrig gemmes eller vises, kun selve tekstindholdet
og synlige link-URL'er. Det er en bevidst sikkerhedsbeslutning, ikke
kun en visnings-detalje: en tracking-pixel virker ved at loade et
billede, og hvis vi aldrig gemmer eller viser det billede, kan det
aldrig loades.

Adgang til en postkasse kræver det adgangstoken, der blev udstedt ved
oprettelse (gemt lokalt i din browser), ikke kun kendskab til selve
adressen. Det forhindrer andre i at gætte sig til din indbakke, blot
ved at gætte en kort, tilfældigt genereret adresse.

### Nulspor Metadata
Analyserer og fjerner skjult metadata fra JPG/PNG-billeder og
PDF-dokumenter, helt lokalt i browseren. Filen sendes aldrig til en
server.

For billeder viser værktøjet GPS-koordinater, kameramodel,
redigeringssoftware og tidsstempler. For PDF'er vises titel, forfatter,
emne, og hvilket program dokumentet er skabt/redigeret i. Hvert fundet
felt forklares i almindeligt sprog, så man forstår hvorfor det kan
være problematisk at dele.

To tekniske begrænsninger er værd at kende:

- **JPEG-rensning er alt-eller-intet.** I modsætning til PDF, hvor man
  kan vælge at bevare specifikke felter, fjerner JPEG-rensning altid
  alle EXIF/IPTC-data på én gang. At kunne bevare ét felt og fjerne et
  andet i en JPEG ville kræve at genskrive hele EXIF-segmentet felt
  for felt, hvilket ikke er bygget i denne version.
- **Et par PDF-felter kan ikke fjernes helt, kun neutraliseres.**
  `pdf-lib` (biblioteket der bruges til at læse/skrive PDF-metadata)
  sætter altid sit eget navn i Producer-feltet og "nu" i
  redigeringsdatoen, hver gang en fil gemmes. Det er ikke en fejl: det
  betyder den rensede fils metadata ikke afslører hvilket program
  eller redigeringstidspunkt den oprindelige fil havde, kun at den er
  blevet behandlet af et renseværktøj. Disse felter vises i UI'en i en
  separat "tekniske oplysninger"-sektion, ikke som et privatlivsfelt
  man kan vælge at fjerne.

**Så hvordan virker det helt konkret?**

1. Du skriver tekst i browseren.
2. Browseren genererer en tilfældig AES-256 nøgle.
3. Indholdet krypteres lokalt med den nøgle, *før* noget sendes til serveren.
4. Serveren modtager og gemmer kun ciphertext, og kender aldrig nøglen.
5. Linket du får ser sådan ud: `nulspor.dk/paste/abc123#nøglen-står-her`.
   Alt efter `#` er et URL-fragment, som browsere **aldrig** sender til
   serveren ved et almindeligt opslag. Det er grunden til at serveren
   ikke kan dekryptere dine data, selv hvis den ville.
6. Når nogen åbner linket, henter browseren ciphertext fra serveren og
   dekrypterer lokalt med nøglen fra fragmentet.

Tilføjer du en adgangskode, lægges et ekstra krypteringslag ovenpå
(udledt af passwordet via PBKDF2), så selv en person der har URL'en
ikke kan læse indholdet uden også at kende adgangskoden.

Du kan også vedhæfte en mindre fil (maks 10 MB) til en paste. Filen
krypteres lokalt sammen med teksten, på samme måde, og kan vedhæftes
uden noget tekstindhold overhovedet hvis du kun vil dele filen.

## Principper

- **Open source.** Hele kildekoden er offentlig og til fri brug (MIT).
- **Ingen tracking.** Ingen cookies, ingen analytics fra tredjepart.
- **Privacy by design.** Kryptering sker i browseren, ikke på serveren.
- **Minimal dataindsamling.** Den eneste log er IP+tidspunkt ved
  filupload, brugt udelukkende til misbrugsbekæmpelse.
- **Stærk kryptering.** AES-256-GCM, PBKDF2 til adgangskode-udledning.

## Sæt Nulspor Mail op (kræver et rigtigt domæne)

I modsætning til Deling og Paste, som kun håndterer HTTP-trafik fra
browseren, skal Nulspor Mail kunne modtage rigtig SMTP-trafik fra hele
internettet. Det kræver lidt mere opsætning end resten af
platformen:

1. **MX-record.** Domænet (f.eks. `nulspor.dk`) skal have en
   MX-record der peger på din servers IP-adresse, så andre
   mailservere ved, hvor de skal sende mail til `*@nulspor.dk` hen.
   Eksempel (hos din DNS-udbyder):
   ```
   nulspor.dk.   MX   10   mail.nulspor.dk.
   mail.nulspor.dk.   A   <din-server-ip>
   ```

2. **Port 25 skal være åben.** Mange VPS-udbydere (Hetzner,
   DigitalOcean, m.fl.) blokerer udgående/indgående port 25 som
   standard, for at bekæmpe spam. Du skal typisk anmode om at få den
   åbnet via en supportanmodning hos din udbyder, før SMTP-serveren
   kan modtage noget som helst.

3. **Rettighed til at binde port 25.** Porte under 1024 kræver
   root-rettigheder på Linux. Kør enten Node-processen som root
   (ikke anbefalet til hele appen), eller giv Node-binæren specifik
   rettighed til at binde lave porte:
   ```bash
   sudo setcap 'cap_net_bind_service=+ep' $(which node)
   ```
   Så kan resten af appen køre som en almindelig bruger.

4. **`MAIL_DOMAIN` i `.env`** skal matche det domæne, du har sat
   MX-records op for.

Hvis du vil teste resten af platformen uden at sætte mail op endnu,
sæt `SMTP_ENABLED=false` i `.env`. Resten af Nulspor (Deling, Paste,
forsiden) kører fuldstændigt uafhængigt af SMTP-serveren.

## Tests

```bash
npm test
```

Kører et sæt smoke-tests (`tests/smoke.mjs`) der starter serveren og
verificerer de vigtigste sider og API-endpoints, inklusiv at
burn-after-reading rent faktisk sletter data efter første visning.

GitHub Actions kører disse tests automatisk på Node 22.x og 24.x ved
hver push og pull request, se `.github/workflows/ci.yml`.

## Kør lokalt

Kræver Node.js 22.5 eller nyere (bruger det indbyggede `node:sqlite`
modul, så der er ingen native build-dependencies at installere).

```bash
npm install
cp .env.example .env
npm start
```

Platformen kører nu på `http://localhost:3000`.

```bash
npm run dev   # med automatisk genstart ved kodeændringer
```

## Arkitektur

```
server/
  index.js        Express-app, samler alle routes
  db.js           SQLite (filer, pastes og mail i samme database)
  storage.js       Storage-lag til Deling (i dag: lokal disk)
  logger.js        Upload-log (IP+tid, til misbrugsbekæmpelse)
  smtp.js          SMTP-server til Nulspor Mail (modtager indkommende mail)
  routes/
    share.js        Nulspor Deling: upload/download
    paste.js         Nulspor Paste: opret/hent/destroy
    mail.js          Nulspor Mail: opret adresse/hent indbakke/hent besked

public/
  index.html        Forside
  privatlivspolitik.html
  del/               Nulspor Deling (upload + download-side)
  paste/             Nulspor Paste (opret + visnings-side)
  mail/              Nulspor Mail (opret adresse + indbakke-side)
  metadata/          Nulspor Metadata (analyser + rens-side)
  vendor/            Selvhostede tredjeparts-browser-bundles (exifr, pdf-lib) - ingen CDN-afhængighed
  js/
    crypto.js          Web Crypto-wrapper - AL kryptering sker her, i browseren
    paste-create.js
    paste-view.js
    del-upload.js
    del-download.js
    mail.js            Opret adresse, poll indbakke, vis beskeder
    metadata-jpeg.js    JPEG metadata-fjernelse (byte-niveau, lossless)
    metadata-png.js     PNG metadata-læsning + fjernelse (chunk-niveau)
    metadata-analyze.js Orkestrering: detektion, analyse, risikovurdering, rensning
    metadata-ui.js      UI-logik for Metadata-siden
  css/
    style.css          Fælles design-system for hele platformen
    paste.css
    del.css
    mail.css
    metadata.css
```

### Tilføje et nyt privacy-værktøj

Strukturen er bygget til at vokse:

1. Tilføj en ny route-fil i `server/routes/dit-værktøj.js`, gerne med
   sin egen tabel i `db.js` hvis den skal lagre noget.
2. Mount den i `server/index.js` med `app.use("/api/dit-værktøj", router)`.
3. Tilføj en mappe i `public/dit-værktøj/` med HTML/CSS/JS, og en
   tilhørende frontend-route i `server/index.js`.
4. Tilføj et nyt `.tool-card` på forsiden under "Værktøjer".

Det fælles design-system i `public/css/style.css` (farver, knapper,
typografi) bruges af alle værktøjer, så nye sider arver udseendet
automatisk.

### Hvorfor `node:sqlite` og ikke `better-sqlite3`?

`node:sqlite` er indbygget i Node 22.5+ og kræver ingen native
compile-trin, hvilket gør det nemmere at installere på en frisk VPS.
Det er markeret som "experimental" af Node-teamet, hvilket betyder
API'en i teorien kan ændre sig i fremtidige Node-versioner, men den
bruges kun isoleret i `server/db.js`. Hvis du foretrækker et mere
modent bibliotek, er det den fil du skal udskifte; resten af appen
rører aldrig databasen direkte.

### Hvorfor står exifr og pdf-lib i devDependencies?

Disse to biblioteker bruges udelukkende i browseren (af Nulspor
Metadata), ikke på serveren. De er kun installeret via npm for at
kunne kopiere deres færdige browser-bundle ind i `public/vendor/` (se
`package.json` for hvordan), så platformen kan køre helt uden CDN-
eller build-step-afhængigheder. Hvis du opdaterer en af dem, kopiér
den nye build manuelt:

```bash
cp node_modules/exifr/dist/full.umd.js public/vendor/exifr.js
cp node_modules/pdf-lib/dist/pdf-lib.min.js public/vendor/pdf-lib.js
```

## Hosting i produktion

En billig VPS (Hetzner, DigitalOcean) fungerer fint, da Node 22+ med
`node:sqlite` ikke kræver noget specielt build-toolchain på serveren.
Sæt appen op bag **nginx** eller **Caddy** med HTTPS, og kør
Node-processen via `pm2` eller en systemd-service for automatisk
genstart.

Husk at sætte `MAX_FILE_SIZE_MB` ift. din disk, og overvej et
automatisk backup af `data/nulspor.db`.

## Licens

MIT.
