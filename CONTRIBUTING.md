# Bidrag til Nulspor

Tak for din interesse i at bidrage til Nulspor. Projektet er bygget til
at vaere let at saette sig ind i, og bidrag er velkomne, store som
smaa.

## Kom i gang

```bash
git clone <din-fork-url>
cd nulspor
npm install
cp .env.example .env
npm run dev
```

Kraever Node.js 22.5 eller nyere.

## Foer du sender en pull request

```bash
npm test
```

Smoke-tests i `tests/smoke.mjs` starter serveren og tjekker, at de
vigtigste sider og API-endpoints svarer korrekt. Sørg for at de
bestaar foer du sender en PR. Hvis du tilfoejer en ny route eller et
nyt vaerktoej, tilfoej gerne en tilhoerende test.

## Sikkerhedsrelaterede aendringer

Nulspor Paste's sikkerhed afhaenger af, at al kryptering sker i
browseren, og at serveren aldrig modtager eller kan udlede
dekrypteringsnoegler. Aendringer i `public/js/crypto.js` eller
`server/routes/paste.js` boer:

- Aldrig sende noeglen (det der staar efter `#` i URL'en) til serveren
  i nogen form (heller ikke i query-parametre, headers, eller logs).
- Bevare at serveren kun ser ciphertext, aldrig plaintext.
- Inkludere tests der verificerer, at dekryptering fejler korrekt med
  forkert noegle/password (se eksisterende moenster i tidligere
  commits hvis du er i tvivl).

Hvis du finder en sikkerhedssaarbarhed, se venligst om der findes en
`SECURITY.md` i repoet, eller kontakt vedligeholderne direkte i stedet
for at aabne et offentligt issue.

## Tilfoeje et nyt privacy-vaerktoej

Se afsnittet "Tilfoeje et nyt privacy-vaerktoej" i README.md for den
overordnede struktur. Generelt:

1. Ny route-fil i `server/routes/`.
2. Ny tabel i `server/db.js` hvis vaerktoejet skal lagre data.
3. Ny mappe i `public/` med HTML/CSS/JS, der genbruger
   `public/css/style.css` for et konsistent udseende.
4. Et nyt `.tool-card` paa forsiden.

## Kodestil

- Almindelig, laesbar ES2022+ JavaScript. Ingen build-step, ingen
  TypeScript-compiler, ingen framework-magi. Det skal vaere muligt at
  laese en fil og forstaa, hvad den goer.
- Kommentarer paa dansk er fint, men hold dem informative, ikke
  selvfoelgelige.
- Hold afhaengigheder til et minimum. Hver ny dependency er en ny ting
  der skal stoles paa.
