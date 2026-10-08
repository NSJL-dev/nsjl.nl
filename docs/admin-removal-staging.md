# Veilig verwijderbeheer — NSJL V2 staging

## Scope en impactanalyse

Basis: `nsjl-v2`, commit `595f3530264f776fa7de204d393dd36e3de29b64`.
Deze wijziging voegt beheeracties toe, zonder ze op bestaande stagingrecords uit
te voeren. Geen schema-/migrationwijzigingen, Storage-acties, Auth-gebruikers,
credentials, sync, Vercel-instellingen of productiewijzigingen.

| Onderdeel | Aangetroffen beheer | Besluit |
| --- | --- | --- |
| Nieuws | Aanmaken, bewerken, statusselectie en losse Archiveren-knop; geen definitieve verwijdering | Archiveren met naambevestiging en versiecontrole. Bericht, permalink, afbeeldingskoppeling en audit blijven behouden. Geen definitieve delete. |
| Agenda | Aanmaken, bewerken, archiveren via `is_active`; geen definitieve verwijdering | Archiveren met naambevestiging en versiecontrole. Bewerkingen van een gearchiveerd item houden het verborgen. Geen definitieve delete. |
| Spelersprofielen | Aanmaken, bewerken, zichtbaarheid en archiveren; geen definitieve verwijdering | Eerst verbergen/archiveren. Alleen een verborgen profiel zonder zes soorten verwijzende records mag daarna definitief worden verwijderd. |
| Sponsors | Aanmaken, bewerken, actief-vlag en archiveren | Archiveren met naambevestiging en versiecontrole. Logo/bestand blijft behouden. Geen definitieve delete. |
| Media | Privé/public/archived-status en beveiligde previews | Bestaande toegangs-/intrekkingsflow behouden. Geen nieuwe record- of bestandsverwijdering: Storage-opruiming vereist afzonderlijke toestemming en beoordeling van alle verwijzingen/caches. |
| Spelerskoppelingen | Contextgebonden koppelen en aliases lezen | Geen verwijder-/ontkoppelfunctie toegevoegd. Die kan lidmaatschappen en actuele/historische statistiekcontext beschadigen. |
| Wedstrijden, stand, statistieken | Brondata lezen, afzonderlijke correcties met reden | Geen verwijderfunctie. Brondata, historie en correcties blijven intact. |
| Synchronisatie/bronconfiguratie | Status/logs lezen, activering geblokkeerd met `SYNC_ENABLED=false` | Geen verwijderfunctie voor reports, locks of logs. Geen sync uitgevoerd. |
| Instellingen | Gevalideerd bewerken van bestaande instellingen | Geen verwijderfunctie; verplichte sitegegevens blijven beschikbaar. |
| Beheerders/Auth | Alleen bestaande veilige accountflows | Geen account-, rol- of gebruikerswijziging in deze opdracht. |
| Auditlog | Alleen lezen; UPDATE/DELETE geblokkeerd door database-trigger | Immutable bescherming blijft behouden. Geen verwijderfunctie. |

De archiveerknoppen stonden al in de uitklapbare kaarten. Het probleem was dus
naast ontbrekende definitieve cleanup ook onvoldoende duidelijke/safe bediening.
Dezelfde layout, bestaande buttons en kleuren blijven behouden; publieke pagina's
en CSS zijn niet aangepast.

## Werkelijk gecontroleerde stagingrelaties

Uitsluitend SELECT op project `qlmnqoeyhmljizxibyky`, bevestigd als
`nsjl-v2-staging`. Alle zes inkomende speler-FKs gebruiken niet-uitgestelde
`NO ACTION`; er zijn geen custom triggers op players/news_posts/events/sponsors.
De zes afhankelijkheden zijn:

- `player_team_seasons.player_id` — lidmaatschappen;
- `player_aliases.player_id` — contextgebonden aliases;
- `external_players.player_id` — bronspelerkoppelingen;
- `player_season_stats.player_id` — actuele officiële statistieken;
- `player_stats_history.player_id` — historische officiële statistieken;
- `legacy_player_stats.player_id` — oorspronkelijke, onbevestigde profielcijfers.

Bij de inventarisatie bestond precies één profiel met de opgegeven testnaam; het
was verborgen en alle zes aantallen waren nul. Dit is alleen een momentopname,
geen vooraf verleende delete-vrijstelling. Het profiel is niet gewijzigd of
verwijderd. Iedere toekomstige aanvraag controleert de actuele toestand opnieuw.
Bronnen met `enabled=true`: 0; sync_runs: 0 bij de inventarisatie.

Profielen hebben een uitgaande FK naar media. Het verwijderen van een profiel
verwijdert geen mediarecord of Storage-object. Auditregels gebruiken een losse
entity-ID; bestaande audits blijven bestaan na een toegestane profielverwijdering.

## Bevestiging, autorisatie en transactie

De actie toont een native bevestigingsvenster met de exacte titel/profielnaam.
Definitief verwijderen krijgt een aparte, onomkeerbare waarschuwing. De dedicated
actieknop is `type=button`; zonder JavaScript kan hij niet stilzwijgend submitten.
Ook archiveren via een bestaande statusselectie/zichtbaarheidscheckbox vereist
nu naambevestiging. Gewoon bewerken krijgt geen onnodige bevestigingsvraag.

De bestaande eigen POST-route behoudt exacte Origin-controle, actieve admin,
MFA/AAL2, gedeelde rate limiting en `no-store`-responses. De mutatieservice
controleert daarnaast de actieve applicatiebeheerder. Geen nieuwe authregels of
clientcredentials; de recordversie is geen sessie-/autorisatietoken.

Voor bestaande nieuws-, agenda-, speler- en sponsorrecords wordt de rij binnen
de schrijftransactie `FOR UPDATE` vergrendeld. De server vergelijkt een SHA-256
van de complete snapshot met de versie in het formulier, en bij archiveren of
verwijderen ook de bevestigde naam. Dit controleert behalve timestamps ook
wijzigingen aan inhoud/status, zonder afhankelijkheid van timestamp-precisie.

Alle bestaande formulieren voor deze vier soorten krijgen een versie. Oudere
tabs zonder versie moeten worden ververst; een oud bewerkformulier kan zo niet
over een latere archivering heen schrijven. Een dubbele of achterhaalde actie
wordt geweigerd zonder tweede succes-audit. De browser blokkeert ook onmiddellijk
een tweede aanvraag zolang de eerste nog loopt, met een ref en disabled fieldset.

Bij definitieve profielverwijdering controleert één query alle zes soorten
afhankelijkheden. Gekoppeld of zichtbaar betekent weigeren. Er worden geen links
ontkoppeld en geen gerelateerde records gewijzigd/verwijderd. De bestaande FKs
vormen een aanvullende blokkade, ook als later een onbekende NO ACTION-relatie
wordt toegevoegd. Eventuele FK-fouten geven een begrijpelijke generieke weigering.

De write en auditinsert zitten in dezelfde transactie. Een auditfout rolt de write
terug. Audits registreren actor, actie en item-ID; geen namen, inhoud of secrets.
Archivering via de editor wordt eveneens als `.archive` vastgelegd.

Na succes gebruikt de bestaande flow een 303 naar de vernieuwde beheerlijst, met
`Gearchiveerd` of `Profiel verwijderd` voor de specifieke actie. Publieke en
adminpaden worden geïnvalideerd. Fouten blijven bij het formulier met uitleg;
409 vraagt herladen en controleren, 404 wijst op een reeds verdwenen item.

## Tests en grenzen van het bewijs

Tests gebruiken uitsluitend tijdelijke lokale PGlite/PostgreSQL-databases en
lokale fixtures met de bestaande migrations. Zij testen alle zes afhankelijkheden,
gekoppelde profielen, media-/auditbehoud, auditrollback, toekomstige FK-blokkade,
naam/versie, stale edits, dubbele en gelijktijdige aanvragen, Origin, onbevoegde
actoren, AAL2-gating, cache-invalidatie en clientbevestiging/dubbele klik.

De echte Supabase-database is niet beschrijfbaar benaderd door deze tests. Lokale
gelijktijdige-aanvraagtests bewijzen het formulierprotocol en eenmalige audit;
PGlite gebruikt één database-instantie. Een volledige multi-proces/runtime- en
persoonlijke browseracceptatie blijft een afzonderlijke stagingcontrole.

Uitgevoerde kwaliteitscontroles:

- Volledige suite: **498 tests PASS, 24 testbestanden**, inclusief 68 nieuwe
  regressies. Commando: `npm test -- --maxWorkers=1 --hookTimeout=90000`.
  De CLI-opstartlimiet is voor de tijdelijke databases; de vastgelegde
  testconfiguratie en de limiet per testcase blijven ongewijzigd.
- Typecheck: **PASS**, na het opnieuw genereren van lokale Next.js-route-types
  met `next typegen --webpack`. Een eerdere parallelle typecheck/build botste
  op tijdelijke gegenereerde bestanden; er is geen broncode-/configfix gebruikt.
- Lint: **PASS**, zonder waarschuwingen.
- Normale productiebuild: lokaal **FAIL** op
  `ENOENT: no such file or directory, uv_resident_set_memory`. Geen adapter of
  build-workaround gebruikt. De echte normale Vercel-build moet de eigenaar
  bevestigen na de push.
- Diff-/whitespacecontrole en secrets-check van alle gewijzigde bestanden:
  **PASS**.

Na de tests is opnieuw uitsluitend lezend bevestigd dat het bestaande testprofiel
nog aanwezig en verborgen is, met nul geactiveerde bronnen en nul sync_runs.

De server gebruikt PostgreSQL-rijvergrendeling en bestaande FK-bescherming, geen
gedeeld procesgeheugen voor de serverconcurrency. Achtergrondstatistieken worden
niet gewist wanneer een profiel verborgen wordt. Ook een aan een gearchiveerd
bericht gekoppelde gepubliceerde afbeelding wordt niet automatisch ingetrokken:
media-intrekking blijft een eigen expliciete beheeractie.

Gearchiveerde agenda-items blijven bewerkbaar maar verborgen. Er is in deze
opdracht geen aparte herstel-/herpublicatiefunctie voor agenda toegevoegd.
Definitieve cleanup van gekoppelde profielen, nieuws, agenda, sponsors, media,
brondata en koppelingen is bewust niet geïmplementeerd.

## Gewijzigde bestanden

- `v2/lib/admin/record-guard.ts` (nieuw)
- `v2/lib/admin/mutations.ts`
- `v2/components/admin-record-actions.tsx` (nieuw)
- `v2/components/admin-form.tsx`
- `v2/components/admin-editors.tsx`
- `v2/app/admin/(protected)/[section]/page.tsx`
- `v2/app/api/admin/[resource]/route.ts`
- `v2/tests/admin-removal.test.ts` (nieuw)
- `v2/tests/admin-removal-client.test.ts` (nieuw)
- `v2/tests/admin-input.ts` (nieuw, actueel formulierprotocol voor bestaande tests)
- `v2/tests/admin-workflows.test.ts`
- `v2/tests/admin.test.ts`
- `v2/tests/public-agenda.test.ts`
- `docs/admin-removal-staging.md` (nieuw)

## Persoonlijke stagingcontrole na Vercel-build

1. Controleer dat de nieuwe commit normaal op Vercel is gebouwd; ververs oudere
   beheertabs om de actuele formulier-versies te laden.
2. Open Nieuws, Agenda, Spelers en Sponsors. Controleer dezelfde layout en de
   benoemde actie in de uitklapbare kaart. Klik Annuleren in de bevestiging en
   controleer dat er geen write of nieuwe audit plaatsvindt.
3. Test gewenst met uitsluitend nieuw, onschuldig testmateriaal: archiveren,
   vernieuwde beheerlijst, verdwenen publieke weergave en één `.archive`-audit.
4. Houd twee tabs van hetzelfde lokale stagingtestitem open; wijzig in de eerste.
   De oude tweede tab moet 409 tonen in plaats van data te overschrijven.
5. De bestaande verborgen testspeler blijft behouden totdat de eigenaar expliciet
   de aparte `Definitief verwijderen`-actie bevestigt. Controleer dan naam en
   actuele koppelingen. De implementatie heeft die actie niet uitgevoerd.
6. Gekoppelde/legacy-profielen mogen bij definitieve verwijdering een weigering
   geven; hun records, aliases, lidmaatschappen en statistieken blijven behouden.
7. Controleer behoud van de bestaande foto's, privépreview/MFA en media-intrekking.
   Geen Storage-opruiming uitvoeren als onderdeel van deze acceptatietest.

Bronreferenties voor SQL-semantiek:
[PostgreSQL 17 row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[Supabase foreign-key deletion rules](https://supabase.com/docs/guides/database/postgres/cascade-deletes).
