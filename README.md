# Nulspor

En dansk open source privacy-platform. Nulspor forklarer hvorfor digitalt
privatliv er vigtigt, og tilbyder praktiske vaerktoejer til at beskytte
det: sikker fildeling og ende-til-ende krypteret tekstdeling.

## Vaerktoejer

### Nulspor Deling
Upload og del filer uden konto eller login. Valgfri adgangskode,
automatisk udloeb (1/7/30 dage), rate limiting mod misbrug.

### Nulspor Paste
Del tekst, noter og kode med ende-til-ende kryptering, inspireret af
[PrivateBin](https://privatebin.info). Serveren ser og gemmer kun
krypteret data, aldrig dit indhold eller din dekrypteringsnoegle.

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

Adgang til en postkasse kraever det adgangstoken, der blev udstedt ved
oprettelse (gemt lokalt i din browser), ikke kun kendskab til selve
adressen. Det forhindrer andre i at gaette sig til din indbakke, blot
ved at gaette en kort, tilfaeldigt genereret adresse.

**Saa hvordan virker det helt konkret?**

1. Du skriver tekst i browseren.
2. Browseren genererer en tilfaeldig AES-256 noegle.
3. Indholdet krypteres lokalt med den noegle, *foer* noget sendes til serveren.
4. Serveren modtager og gemmer kun ciphertext, og kender aldrig noeglen.
5. Linket du faar ser saadan ud: `nulspor.dk/paste/abc123#noeglen-staar-her`.
   Alt efter `#` er et URL-fragment, som browsere **aldrig** sender til
   serveren ved et almindeligt opslag. Det er grunden til at serveren
   ikke kan dekryptere dine data, selv hvis den ville.
6. Naar nogen aabner linket, henter browseren ciphertext fra serveren og
   dekrypterer lokalt med noeglen fra fragmentet.

Tilfoejer du en adgangskode, laegges et ekstra krypteringslag ovenpaa
(udledt af passwordet via PBKDF2), saa selv en person der har URL'en
ikke kan laese indholdet uden ogsaa at kende adgangskoden.

Du kan ogsaa vedhaefte en mindre fil (maks 10 MB) til en paste. Filen
krypteres lokalt sammen med teksten, paa samme maade, og kan vedhaeftes
uden noget tekstindhold overhovedet hvis du kun vil dele filen.

## Principper

- **Open source.** Hele kildekoden er offentlig og til fri brug (MIT).
- **Ingen tracking.** Ingen cookies, ingen analytics fra tredjepart.
- **Privacy by design.** Kryptering sker i browseren, ikke paa serveren.
- **Minimal dataindsamling.** Den eneste log er IP+tidspunkt ved
  filupload, brugt udelukkende til misbrugsbekaempelse.
- **Staerk kryptering.** AES-256-GCM, PBKDF2 til adgangskode-udledning.

## Saet Nulspor Mail op (kraever et rigtigt domaene)

I modsaetning til Deling og Paste, som kun haandterer HTTP-trafik fra
browseren, skal Nulspor Mail kunne modtage rigtig SMTP-trafik fra hele
internettet. Det kraever lidt mere opsaetning end resten af
platformen:

1. **MX-record.** Domaenet (f.eks. `nulspor.dk`) skal have en
   MX-record der peger paa din servers IP-adresse, saa andre
   mailservere ved, hvor de skal sende mail til `*@nulspor.dk` hen.
   Eksempel (hos din DNS-udbyder):
   ```
   nulspor.dk.   MX   10   mail.nulspor.dk.
   mail.nulspor.dk.   A   <din-server-ip>
   ```

2. **Port 25 skal vaere aaben.** Mange VPS-udbydere (Hetzner,
   DigitalOcean, m.fl.) blokerer udgaaende/indgaaende port 25 som
   standard, for at bekaempe spam. Du skal typisk anmode om at faa den
   aabnet via en supportanmodning hos din udbyder, foer SMTP-serveren
   kan modtage noget som helst.

3. **Roettighed til at binde port 25.** Porte under 1024 kraever
   root-rettigheder paa Linux. Koer enten Node-processen som root
   (ikke anbefalet til hele appen), eller giv Node-binaeren specifik
   rettighed til at binde laave porte:
   ```bash
   sudo setcap 'cap_net_bind_service=+ep' $(which node)
   ```
   Saa kan resten af appen koere som en almindelig bruger.

4. **`MAIL_DOMAIN` i `.env`** skal matche det domaene, du har sat
   MX-records op for.

Hvis du vil teste resten af platformen uden at saette mail op endnu,
saet `SMTP_ENABLED=false` i `.env`. Resten af Nulspor (Deling, Paste,
forsiden) koerer fuldstaendigt uafhaengigt af SMTP-serveren.

## Tests

```bash
npm test
```

Koerer et sæt smoke-tests (`tests/smoke.mjs`) der starter serveren og
verificerer de vigtigste sider og API-endpoints, inklusiv at
burn-after-reading rent faktisk sletter data efter foerste visning.

GitHub Actions koerer disse tests automatisk paa Node 22.x og 24.x ved
hver push og pull request, se `.github/workflows/ci.yml`.

## Koer lokalt

Kraever Node.js 22.5 eller nyere (bruger det indbyggede `node:sqlite`
modul, saa der er ingen native build-dependencies at installere).

```bash
npm install
cp .env.example .env
npm start
```

Platformen koerer nu paa `http://localhost:3000`.

```bash
npm run dev   # med automatisk genstart ved kodeaendringer
```

## Arkitektur

```
server/
  index.js        Express-app, samler alle routes
  db.js           SQLite (filer, pastes og mail i samme database)
  storage.js       Storage-lag til Deling (i dag: lokal disk)
  logger.js        Upload-log (IP+tid, til misbrugsbekaempelse)
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
  js/
    crypto.js          Web Crypto-wrapper - AL kryptering sker her, i browseren
    paste-create.js
    paste-view.js
    del-upload.js
    del-download.js
    mail.js            Opret adresse, poll indbakke, vis beskeder
  css/
    style.css          Faelles design-system for hele platformen
    paste.css
    del.css
    mail.css
```

### Tilfoeje et nyt privacy-vaerktoej

Strukturen er bygget til at vokse:

1. Tilfoej en ny route-fil i `server/routes/dit-vaerktoej.js`, gerne med
   sin egen tabel i `db.js` hvis den skal lagre noget.
2. Mount den i `server/index.js` med `app.use("/api/dit-vaerktoej", router)`.
3. Tilfoej en mappe i `public/dit-vaerktoej/` med HTML/CSS/JS, og en
   tilhoerende frontend-route i `server/index.js`.
4. Tilfoej et nyt `.tool-card` paa forsiden under "Vaerktoejer".

Det faelles design-system i `public/css/style.css` (farver, knapper,
typografi) bruges af alle vaerktoejer, saa nye sider arver udseendet
automatisk.

### Hvorfor `node:sqlite` og ikke `better-sqlite3`?

`node:sqlite` er indbygget i Node 22.5+ og kraever ingen native
compile-trin, hvilket goer det nemmere at installere paa en frisk VPS.
Det er markeret som "experimental" af Node-teamet, hvilket betyder
API'en i teorien kan aendre sig i fremtidige Node-versioner, men den
bruges kun isoleret i `server/db.js`. Hvis du foretraekker et mere
modent bibliotek, er det den fil du skal udskifte; resten af appen
roerer aldrig databasen direkte.

## Hosting i produktion

En billig VPS (Hetzner, DigitalOcean) fungerer fint, da Node 22+ med
`node:sqlite` ikke kraever noget specielt build-toolchain paa serveren.
Saet appen op bag **nginx** eller **Caddy** med HTTPS, og koer
Node-processen via `pm2` eller en systemd-service for automatisk
genstart.

Husk at saette `MAX_FILE_SIZE_MB` ift. din disk, og overvej et
automatisk backup af `data/nulspor.db`.

## Licens

MIT.
