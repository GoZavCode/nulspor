# Sikkerhedspolitik

Nulspor er en privacy-platform, og sikkerheden i kryptering og
datahaandtering er kernen i produktet. Hvis du finder en
sikkerhedssaarbarhed, saet vi stor pris paa at du rapporterer den
ansvarligt.

## Hvad er en sikkerhedssaarbarhed her?

Eksempler paa det vi betragter som kritisk:

- Noeglen til en paste (det der staar efter `#` i URL'en) bliver
  sendt til serveren i nogen form.
- Serveren kan dekryptere eller laese indholdet af en paste.
- Adgangskoder gemmes eller logges i klartekst.
- Burn-after-reading-pastes kan hentes mere end én gang.
- En IP-adresse eller andet identificerende kan kobles til specifikt
  paste- eller fil-indhold paa en maade, der ikke er beskrevet i
  privatlivspolitikken.

## Rapportering

Aabn venligst **ikke** et offentligt GitHub issue for
sikkerhedsproblemer. Kontakt i stedet vedligeholderne direkte via
kontaktoplysningerne paa nulspor.dk, eller via en privat
sikkerhedsrapport paa GitHub, hvis repoet har den funktion aktiveret.

Beskriv venligst:

- Hvilken del af platformen (Deling, Paste, etc.)
- Trin til at reproducere problemet
- Hvad du forventede skulle ske, og hvad der faktisk skete

Vi bestraeber os paa at bekraefte modtagelsen af din rapport hurtigst
muligt, og at holde dig opdateret om fremskridt mod en fix.

## Scope

Denne politik gaelder kildekoden i dette repo. Den daekker ikke
tredjeparts-infrastruktur (hosting-udbydere, DNS, etc.) som en given
instans af Nulspor koerer paa, da det varierer fra installation til
installation.
