# Publieke agenda — NSJL V2 staging

Bronbranch: `nsjl-v2`, basiscommit `c70c44ab43d7879fdc4136e800e506b21472571d`.
Uitsluitend code voor staging; geen database-, Auth-, Storage-, credential-,
Vercel-, domein- of productiewijzigingen. `SYNC_ENABLED=false` blijft vereist.

## Gegevens en zichtbaarheid

`/agenda` gebruikt één gerichte serverquery op de bestaande `events`-tabel.
Alleen `is_active=true` wordt gelezen, met uitsluitend ID, titel, omschrijving,
begin, einde, locatie en activiteitsoort. Maker-ID en beheertimestamps worden
niet geselecteerd. Competities, standen, media, gebruikers en syncinformatie
worden niet geladen voor deze pagina.

Het bestaande model heeft geen aparte concept-, publicatie- of privéstatus:
actieve agenda-items zijn publiek bedoeld. Het bestaande agendabeheer maakt
actieve items aan; archiveren zet `is_active=false` en haalt ze uit de publieke
agenda. Gewone datumveroudering is geen archivering: een actief oud item blijft
zichtbaar in het overzicht met afgelopen activiteiten.

Alleen-lezen controle van `nsjl-v2-staging` bevestigde de bestaande kolommen,
`timestamptz` voor begin/einde, één actief en één inactief item, nul ingeschakelde
syncbronnen en nul sync runs. Er is geen stagingrecord gewijzigd of toegevoegd.

## Datum, tijd en presentatie

- Aankomende en lopende activiteiten: oplopend op werkelijk beginmoment.
- Afgelopen activiteiten: meest recent begonnen eerst.
- Een lopende activiteit met bekende eindtijd blijft zichtbaar tot die eindtijd
  en krijgt het label `Nu bezig`. Op het eindmoment valt zij onder afgelopen.
- Zonder eindtijd wordt geen duur afgeleid: het bekende beginmoment is de grens.
  Een activiteit die precies nu begint blijft in de aankomende selectie.
- Datums en tijden worden Nederlands weergegeven in `Europe/Amsterdam`,
  onafhankelijk van de server-/browserzone. Een einde op een andere lokale dag
  krijgt zijn eigen datum. Bij een zomertijd-/wintertijdwisseling tijdens een
  activiteit worden ook de tijdzoneafkortingen getoond.
- Ontbrekende eindtijd, locatie en omschrijving krijgen duidelijke tekst;
  tijden, locaties en activiteiten worden niet verzonnen.
- Omschrijvingen zijn gewone, escaped tekst met behoud van regelafbrekingen.
  Er wordt geen aangeleverde HTML uitgevoerd.

De pagina gebruikt het bestaande publieke Page/SectionHeading/EmptyState-ontwerp,
de bestaande fonts, kleuren, cards, border-radius en schaduw. Twee kolommen op
grotere schermen; één kolom vanaf 660px en kleiner. Regels blijven scoped onder
`.public-site`, zodat adminstyling niet wordt geraakt. Langere titels en locaties
kunnen afbreken zonder horizontale overflow.

Agenda is toegevoegd aan de huidige desktop- en mobiele navigatie en de sitemap.
De actieve navigatielink wordt gemarkeerd. De homepagevolgorde blijft ongewijzigd.

## Vernieuwing en fouten

`force-dynamic` en `revalidate=0` laten elk nieuw paginaverzoek de huidige actieve
records lezen. De bestaande beveiligde beheerroute invalideert nu ook `/agenda`
na succesvol opslaan of archiveren. Een al geopende tab krijgt geen realtime-
push: ververs die pagina om wijzigingen te bekijken.

Een lege agenda werkt zonder competitiecontext of seedcontent en toont nette
lege toestanden voor aankomend en afgelopen. Een echte databasefout wordt niet
als lege agenda verhuld, maar gaat naar de bestaande publieke foutboundary met
een generieke melding en opnieuw-proberenknop. De UI toont geen ruwe fouten.

## Controles

De nieuwe regressies testen sortering, stabiele gelijke datums, lege agenda,
toekomst/past/lopende activiteiten, grensmomenten, Nederlandse notatie,
Amsterdam-middernacht, zomer-/wintertijd en de herhaalde kloktijd, meerdaagse
activiteiten, ontbrekende velden, XSS-escaping, navigatie en sitemap.

De database-/workflowtests gebruiken een tijdelijke lokale PostgreSQL/PGlite-
database met bestaande migrations. Ze testen de echte publieke SELECT, de
afscherming van inactieve items en makerinformatie, en aanmaken/bewerken/
archiveren via de bestaande adminroute met Auth-testdouble. Zowel archivering
als fysieke verwijdering van een lokale fixture verdwijnt bij een nieuwe read.
Ook publicatie-onafhankelijke lege databases, responsive CSS op negen breedtes,
ongewijzigde data en uitgeschakelde sync worden gecontroleerd.

Geen fixtures of testaccounts worden naar de echte stagingdatabase geschreven.
De persoonlijke stagingcontrole blijft nodig na de nieuwe Vercel-build.

Uitgevoerde kwaliteitscontroles:

- Typecheck: PASS.
- Lint: PASS, zonder waarschuwingen.
- Gerichte frontend-/agendacontroles: 98 tests PASS, waaronder de 31 nieuwe
  agenda-tests.
- Volledige bestaande en uitgebreide suite: 430 tests PASS in 22 testbestanden,
  uitgevoerd met `npm test -- --maxWorkers=1 --hookTimeout=90000`. Eerdere lokale
  runs overschreden de 30 seconden voor het opstarten van tijdelijke databases.
  Alleen deze CLI-run kreeg meer opstarttijd; de vastgelegde testconfiguratie en
  de limiet per testcase zijn niet gewijzigd. Bestaande Auth-, admin-, media-,
  parser- en syncregressies zijn inbegrepen; er is geen echte sync uitgevoerd.
- Normale productiebuild: lokaal FAIL door
  `ENOENT: no such file or directory, uv_resident_set_memory`. Dit is de bekende
  sandboxbeperking. Er is geen geheugenadapter of build-workaround gebruikt.
  Een geslaagde normale Vercel-build moet de eigenaar nog bevestigen.
- Diff-/whitespacecontrole en secrets-check van de gewijzigde bestanden: PASS.

Responsive controles zijn CSS-/markupregressies op negen breedtes, geen bewijs
van een volledige persoonlijke browser- of visuele stagingacceptatietest.

## Persoonlijke stagingcontrole

1. Controleer de nieuwe commit en normale Vercel-build; open `/agenda` zonder
   login via de desktop- en mobiele navigatie. Controleer ook het actieve menu-item.
2. Vergelijk de zichtbare activiteitvelden met bestaande actieve records in beheer.
   Inactieve/gearchiveerde items horen niet op de publieke pagina te staan.
3. Controleer datum, begin, eventuele eindtijd, locatie, tekst en soort activiteit.
   Ontbrekende gegevens mogen geen verzonnen waarden opleveren.
4. Controleer de volgorde en aparte secties voor aankomend/lopend en afgelopen,
   inclusief de lege toestand als er niets aankomends is.
5. Test desgewenst uitsluitend met een nieuw onschuldig testitem in het bestaande
   agendabeheer: aanmaken, tijd/locatie wijzigen, archiveren. Ververs `/agenda`
   telkens; vergelijk het resultaat. De implementatie heeft geen bestaande items
   aangepast of deze persoonlijke test namens de eigenaar uitgevoerd.
6. Controleer 1440px, laptop/tablet, 900px, 660px, 420px en een kleine telefoon:
   cards, lange teksten, navigatie, keyboardfocus en geen horizontale overflow.
7. Controleer bestaande publieke foto's, privépreview met/zonder login/MFA en
   intrekking zoals beschreven in `media-access-staging.md`. De media-/Auth-
   logica is niet gewijzigd; de volledige regressies blijven vereist.

## Gewijzigde bestanden

- `v2/app/(public)/agenda/page.tsx` (nieuw)
- `v2/components/public/agenda.tsx` (nieuw)
- `v2/lib/agenda.ts` (nieuw)
- `v2/lib/public-data.ts`
- `v2/app/(public)/public.css`
- `v2/components/public/navigation.tsx`
- `v2/app/sitemap.ts`
- `v2/app/api/admin/[resource]/route.ts` (alleen toevoeging cache-invalidatie)
- `v2/tests/public-agenda.test.ts` (nieuw)
- `v2/tests/public-bound-routes.test.ts`
- `v2/tests/public-frontend.test.ts`
- `v2/tests/public-responsive.test.ts`
- `docs/public-agenda-staging.md` (nieuw)
