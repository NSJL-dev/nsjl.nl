# Sponsors, adminhuisstijl en veilige verwijdering

## Impact en grenzen

Deze uitbreiding werkt alleen op `nsjl-v2`. Tijdens implementatie en automatische
tests worden geen stagingrecords of Storage-objecten gewijzigd of verwijderd.
Tests gebruiken lokale PostgreSQL-fixtures en een gemockte Storage-client.

| Onderdeel | Beleid |
| --- | --- |
| Spelers | Eerst archiveren; verwijderen alleen zonder lidmaatschappen, aliases, externe koppelingen, actuele/historische/legacy-statistieken. Foto blijft bewaard. |
| Nieuws | Eerst archiveren; uitsluitend het geselecteerde bericht verwijderen. Afbeelding en audit blijven bewaard. |
| Agenda | Eerst archiveren; uitsluitend de geselecteerde activiteit verwijderen. |
| Sponsors | Eerst deactiveren/archiveren; uitsluitend de sponsor verwijderen. Logo blijft bewaard. |
| Afbeeldingskoppelingen | Losmaken van één speler, nieuwsbericht of sponsor; bestand en andere verwijzingen blijven bewaard. |
| Media | Eerst archiveren; alle vier soorten verwijzingen moeten ontbreken. Alleen eigen WebP-uploads in de privébucket komen in aanmerking. Een oude publieke kopie blokkeert bestandsverwijdering. |
| Wedstrijden | Alleen expliciet `source=manual`, zonder uitslag, rapport, externe identificatie, resultaatregels of overrides. Eerst annuleren. Geen wijziging aan brondata. |
| Uitslagen, standen en statistieken | Geen algemene verwijderactie: bron-, historie- en contextintegriteit gaan voor. |
| Spelerskoppelingen, competitiecontext, correctiehistorie | Geen algemene verwijderactie: een koppeling/correctie kan meerdere brongegevens beïnvloeden. |
| Accounts, rollen, beveiliging, bronconfiguratie, syncgeschiedenis, audit | Uitgesloten; geen algemene deleteknop. |
| Instellingen | Beheerbare waarden kunnen worden aangepast; verwijderen kan verplichte publieke instellingen laten verdwijnen en is uitgesloten. |

De bestaande database heeft geen inkomende foreign keys naar nieuws, agenda of
sponsors. Spelers hebben zes beschermende relaties; media heeft vier; wedstrijden
hebben resultaatregels en correcties. De bestaande `NO ACTION`-constraints blijven
ongewijzigd. Er zijn geen cascades, automatische ontkoppelingen of migrations.

## Verwijderbeveiliging

Iedere actie vereist dezelfde server-side admin/AAL2-, Origin- en ratelimitcontroles.
Definitief verwijderen vereist daarnaast de getypte, exacte naam en een hash van
het complete geladen record. Een rijslot en transactionele hercontrole beschermen
tegen gelijktijdige edits/verwijderingen. Een succesvolle verwijdering en het audit
worden samen vastgelegd. Geweigerde verwijderingen na identificatie van een geldige
admin worden apart en zonder inhoud of exceptiondetails geaudit; anonieme requests
worden geweigerd voordat de database wordt geopend.

Storage en PostgreSQL delen geen transactie. Daarom wordt bij bestandsverwijdering
eerst een duurzame intentie geaudit terwijl de ongekoppelde media gearchiveerd blijft.
Vervolgens wordt de rij opnieuw vergrendeld, het originele privébestand via de
Storage API verwijderd en de registratie met het voltooiingsaudit verwijderd.
Een onderbreking laat de gearchiveerde registratie en intentie bestaan. Wijzigen
of opnieuw publiceren wordt geblokkeerd. Een expliciet bevestigde nieuwe poging
kan na een gelogde fout (of verlopen wachttijd) dezelfde intentie veilig afronden.
Er worden nooit andere bestanden of publieke oude kopieën automatisch verwijderd.

## Stagingacceptatie door de eigenaar

1. Controleer `/sponsors` op desktop en telefoon: actieve testsponsor, volgorde,
   omschrijving, website en uitsluitend gepubliceerde logo's.
2. Controleer login/MFA en alle beheermodules: NSJL-logo, wit/blauw/goud,
   leesbare formulieren, tabellen en bediening met Tab/Escape.
3. Maak zelf tijdelijke nieuws-, agenda- en sponsorfixtures aan. Archiveer ze;
   open daarna definitief verwijderen, typ een verkeerde naam (geen request),
   annuleer, en verwijder pas na correcte bevestiging. Controleer audit en lijst.
4. Gebruik twee tabbladen om een oude revisie te testen: wijzig in tab A, probeer
   verwijderen in B. Verwacht een conflict en behoud van het gewijzigde record.
5. Een gekoppeld spelersprofiel blijft geblokkeerd. Verwijder het bestaande
   testprofiel alleen wanneer je dat persoonlijk wilt en het ongekoppeld is.
6. Koppel een zelfgemaakte testafbeelding aan twee fixtures. Maak één koppeling
   los; controleer dat de andere en het bestand blijven bestaan. Bestandsverwijdering
   blijft geblokkeerd tot alle verwijzingen weg zijn en de media gearchiveerd is.
7. Test bestandsverwijdering uitsluitend met een nieuwe wegwerp-upload. Controleer
   dat zowel registratie als privéobject verdwijnen; `/api/media/<id>` levert
   geen bytes, privépreview vereist nog steeds admin/MFA.
8. Controleer dat oude publieke/signed URL's geen bewijs van onmiddellijke intrekking
   leveren: eerder gedownloade of gecachte bytes kunnen niet worden teruggeroepen.
   Voor oude publieke kopieën is afzonderlijke, expliciete opruimtoestemming nodig.
9. Synchronisatie blijft uit. Er worden geen imports, persoonlijke Auth-tests of
   productiehandelingen door de implementatie uitgevoerd.

## Uitgevoerde lokale controles

- Typecheck: PASS.
- Lint: PASS.
- Volledige suite: 615 tests PASS in 28 bestanden.
- Nieuwe suites: sponsors 24, definitief verwijderen 49, media-verwijdering 27,
  adminhuisstijl 14. Bestaande suites zijn behouden en uitgebreid.
- Responsive CSS/SSR: 1440, 1200, 1024, 900, 768, 660, 420, 360 en 320 px.
- Contrast: tekstparen minimaal 4.5:1; inputranden minimaal 3:1.
- Normaal `npm run build`: lokale sandbox blokkeert met
  `ENOENT uv_resident_set_memory`. Geen adapter of workaround gebruikt.
  De normale Vercel-build en de persoonlijke visuele acceptatie blijven nodig.
- Geen stagingmutaties, migrations, verwijderingen of Bullshooter-imports uitgevoerd.

De mediaflow gebruikt de bestaande tabellen en het immutable auditmodel; er is
geen schemamigratie nodig. Veranderde of onbekende inkomende mediarelaties en
verwijder-cascades worden geweigerd. Fysieke Storage-tests zijn met mocks bewezen;
werkelijke bestandsverwijdering is uitsluitend onderdeel van jouw wegwerptest.

## Gewijzigde bestanden

- `v2/app/(public)/public.css`
- `v2/app/(public)/sponsors/page.tsx`
- `v2/app/admin/(auth)/login/page.tsx`
- `v2/app/admin/(auth)/mfa/page.tsx`
- `v2/app/admin/(protected)/[section]/page.tsx`
- `v2/app/admin/admin.css`
- `v2/app/admin/layout.tsx`
- `v2/app/api/admin/[resource]/route.ts`
- `v2/app/design-tokens.css`
- `v2/app/layout.tsx`
- `v2/app/sitemap.ts`
- `v2/components/admin-editors.tsx`
- `v2/components/admin-form.tsx`
- `v2/components/admin-nav-link.tsx`
- `v2/components/admin-record-actions.tsx`
- `v2/components/admin-shell.tsx`
- `v2/components/data-ui.tsx`
- `v2/components/public/navigation.tsx`
- `v2/components/public/sponsors.tsx`
- `v2/docs/sponsors-admin-deletion.md`
- `v2/lib/admin/media-deletion.ts`
- `v2/lib/admin/mutations.ts`
- `v2/lib/admin/record-guard.ts`
- `v2/lib/media.ts`
- `v2/lib/public-data.ts`
- `v2/lib/queries.ts`
- `v2/tests/admin-identity.test.ts`
- `v2/tests/admin-input.ts`
- `v2/tests/admin-permanent-delete.test.ts`
- `v2/tests/admin-removal-client.test.ts`
- `v2/tests/admin-removal.test.ts`
- `v2/tests/admin-render.test.ts`
- `v2/tests/media-deletion.test.ts`
- `v2/tests/public-bound-routes.test.ts`
- `v2/tests/public-frontend.test.ts`
- `v2/tests/public-responsive.test.ts`
- `v2/tests/public-sponsors.test.ts`
