# NSJL V2 — Technical Audit & Implementation Proposal

**Auditdatum:** 6 oktober 2026, Europe/Amsterdam. **Status:** fase 1 afgerond; voorstel voor implementatie, geen productieaanpassingen.

Onderzocht: beide aangeleverde specificaties, alle 14 projectbestanden uit `nsjl.nl-main.zip`, de live website, drie Bullshooter-ingangspagina’s en beide daaruit ontdekte LeagueLeader HTML-reports. De macOS-metadata in de ZIP is geen applicatiecode. Feiten, voorstellen en onzekerheden worden hieronder afzonderlijk benoemd.

## 1. Executive summary

**Advies: behoud NSJL-content en herkenbare vormgeving; bouw de dynamische laag met Next.js/TypeScript, PostgreSQL bij Supabase, Drizzle, Supabase Auth en Storage, en hosting bij Vercel.** Laat Supabase Cron periodiek een beveiligde serverroute aanroepen. De publieke site leest uitsluitend de eigen database.

De huidige productieversie is een statische HTML-pagina op GitHub-infrastructuur. Het contactformulier gebruikt Formspree. De meegeleverde React-map is een onvolledig prototype en wordt niet door de huidige pagina geladen. Er bestaat in de aangeleverde code geen eigen database, backend, authenticatie of automatische competitie-import.

De lokale proof of concept heeft de actuele report-URL uit het iframe ontdekt en echte HTML-tabellen uitgelezen. Stand, uitslagen, X01, Cricket en toekomstige wedstrijden zijn technisch beschikbaar. De belangrijkste ontwerpwijzigingen ten opzichte van de blauwdruk zijn: teamlidmaatschap per seizoen, teamgebonden spelersstatistieken, onderscheid tussen ontbrekende uitslagen en verdwenen teams, en uitbreiding van de aangetroffen statistiekkolommen.

GitHub Pages kan geen eigen servercode voor dit voorstel uitvoeren [8]. Daarom is een hostingwijziging voor de gekozen geïntegreerde serverarchitectuur nodig. De exacte huidige Pages-instellingen en het beheer van DNS blijven onbevestigd zonder accountinformatie.

## 2. Current architecture

### Wat draait er nu?

De rechtstreeks opgehaalde `https://nsjl.nl/` gaf HTTP 200 en header `Server: GitHub.com`. De ontvangen HTML is byte voor byte identiek aan het aangeleverde `index.html`: 56.542 bytes, SHA-256 `c6d5104fc4f09cd198d2c74308b46984c1f300490e45a03948187a571a5d7577`. De live response meldde als Last-Modified 23 juli 2026. Dit bevestigt de actieve codeversie en ondersteunt GitHub Pages als hostingverklaring; branch, eigenaar en Pages-buildinstellingen zijn niet publiek vastgesteld.

`index.html` bevat 1.491 regels: inline CSS, alle zichtbare content en vanilla JavaScript. Navigatie gebruikt ankers op dezelfde pagina. JavaScript verzorgt het mobiele menu, scrollanimaties, navigatiehighlight en het contactformulier. De pagina laadt geen `src/main.jsx` en bevat geen React-root.

### Data en formulier

Stand, spelers, statistieken, nieuws en agenda staan rechtstreeks in HTML. Er is geen lokale opslag, cookie-gebaseerde applicatiesessie, databaseverbinding of competitie-API aangetroffen. De zomerstand bevat 20 koppelteams; de actieve teamsectie bevat vier spelers en de nieuwssectie drie berichten. Een datum van 23 juli wordt op 6 oktober nog als komende wedstrijd getoond [1].

Het actieve formulier POST naar `https://formspree.io/f/mdajbaba`, met `naam`, `email` en `bericht`. JavaScript verstuurt `FormData`, vraagt JSON terug, blokkeert tijdelijk de verzendknop en toont succes of fout op basis van de HTTP-response. Zonder JavaScript blijft de gewone formulieractie beschikbaar. De publieke formulier-ID is geen geheim. Het ontvangstadres, spaminstellingen, abonnement en daadwerkelijke aflevering zijn niet uit de code vast te stellen. Er is geen testbericht verzonden.

### Build en deployment

De productiepagina heeft geen bundler nodig: HTML en afbeeldingen zijn direct serveerbaar. `CNAME` bevat `nsjl.nl`. In de ZIP ontbreken `package.json`, lockfile, buildconfiguratie, CI-workflows, Dockerfile, serverconfiguratie, migrations en environmentbestanden. Er is daardoor geen reproduceerbare npm-build voor het React-prototype. Niet-aangeleverde accountinstellingen of bestanden kunnen hiermee niet worden uitgesloten.

## 3. Existing code assessment

### Volledige bestandsinventaris

| Bestand | Bevinding | Behouden/veranderen |
| --- | --- | --- |
| `index.html` | Actieve productiepagina; alle echte content en stijlen | Behouden als migratiebron en referentie; later opdelen in componenten |
| `CNAME` | Domeinnaam `nsjl.nl` | Bewaren; domein pas na acceptatie omzetten |
| `img/logo-nsjl.png` | PNG met transparantie, 2031 × 2058 | Origineel bewaren; webvarianten maken |
| `img/logo-nsjl-blauw.png` | Zelfde formaat; actief gebruikt in navigatie | Behouden en optimaliseren |
| `src/main.jsx` | React-root, StrictMode, BrowserRouter | Prototype archiveren; niet de actieve entrypoint |
| `src/App.jsx` | Routes `/`, `/team`, `/matches`, `/stats` | Routeconcept hergebruiken; Next.js-routing toepassen |
| `src/components/Navbar.jsx` | Basisnavigatie | Structuur bruikbaar; branding en toegankelijkheid verbeteren |
| `src/components/BottomNav.jsx` | Alleen emoji-links | Idee bruikbaar; zichtbare labels en toegankelijke namen toevoegen |
| `src/pages/Home.jsx` | Framer Motion; voorbeeldwedstrijd en score | Layoutidee beoordelen; voorbeelddata niet migreren |
| `src/pages/Matches.jsx` | Voorbeeldteams en fictieve live score | Vervangen door echte queries |
| `src/pages/Stats.jsx` | Recharts met P1/P2/P3-voorbeelddata | Geen betrouwbare dataset; grafiek alleen indien zinvol |
| `src/pages/Team.jsx` | Kaarten vanuit `players.js` | Componentidee behouden; velden op echt model afstemmen |
| `src/data/players.js` | Twee fictieve spelers | Bewaren als prototype; niet als echte spelers importeren |
| `src/styles.css` | Licht ontwerp met Inter | Niet blind boven actieve styling leggen |

### Concrete problemen

De functionele specificatie noemt donker/groen. De daadwerkelijke huidige site is overwegend wit, blauw en goud, met donkerblauwe contactsectie en footer. V2 kan de gevraagde donkere/groene richting krijgen, maar dat is een bewuste visuele wijziging. Logo, typografische kracht, humor, kaarten, teamherkenning en informatievolgorde blijven de basis.

De link naar `#live` heeft geen werkende actieve live-sectie. Live- en offline-demo’s zijn met fragiele, deels geneste HTML-comments afgeschermd. Er is geen realtime scoringbron. Laat “Live” in V2 actuele geïmporteerde statistieken betekenen, met bron- en controledatum.

CSS verwijst naar niet-gedefinieerde `--blue-600` en `--gray-400`. De stand heeft minimaal 560 px breedte en vereist horizontaal scrollen op telefoons. Formulierlabels hebben geen expliciete `for`/`id`-koppeling; het menu mist statuscommunicatie zoals `aria-expanded`. Verminderde animatievoorkeur is niet uitgewerkt. Het script maakt kaarten onzichtbaar voordat de observer ze toont; content moet ook bij scriptproblemen bruikbaar blijven.

Een title, taal en viewport bestaan. Meta description, canonical, Open Graph, sitemap en robots-configuratie ontbreken in de aangeleverde projectbestanden. Er zijn geen tests. Beide logo’s zijn grote bronafbeeldingen voor een navigatiebeeld van 50 px.

**Behoud:** echte teksten, drie nieuwsberichten, vier bestaande profielen, zomerstand, contactgegevens, logo’s, formulierintegratie en bronarchief. **Aanpassen:** dataopslag, rendering, routing, beheer, toegankelijkheid, SEO en afbeeldingen. **Geen verwijdering tijdens deze audit.**

## 4. Bullshooter investigation

De stabiele ingang is de Bullshooter-pagina, niet een gedateerd report. De uitslagenpagina bevat één iframe met `id="ifrm_1"`. De actuele `src` is een LeagueLeader-export op Bullshooters eigen domein [2, 3]:

`https://www.bullshooterevents.nl/files/Competitie2627_Uitslagen/261003_REU3.html`

De speelschemapagina verwijst eveneens via een iframe naar [4, 5]:

`https://www.bullshooterevents.nl/files/Competitie2627_Speelschema's/Speelschema_REU3.html`

**Discovery is bewezen voor de huidige HTML.** De lokale proef leest `iframe.src` uit de ingangspagina en lost die op ten opzichte van de pagina-URL. De importer moet telkens opnieuw discoveren; niet zelf de datum in bestandsnamen ophogen, directories scannen of aannemen dat morgen een bepaalde URL bestaat. Bij een gewijzigd iframe moet discovery veilig falen. Een handmatig ingestelde noodbron blijft mogelijk met dezelfde validatie.

Het gevonden format bestaat uit gewone HTML-tabellen, geen noodzakelijk browsergerenderde app. Een server-side DOM-parser volstaat. Kies tabellen op sectie en kolomnamen, niet op vaste tabelindex. De kop noemt intern Division A: dat is de technische divisie in league REU327; publiek blijft dit Rayon Reusel, 3e Divisie.

Er is in de onderzochte pagina’s en publieke documentatiezoekopdrachten geen bruikbare officiële API of feed voor deze Reusel-data aangetroffen. Dat bewijst niet dat geen partner-API bestaat. HTML is daarom het concrete voorstel. Controleer vóór periodieke productie-import gebruiksvoorwaarden en toegestane frequentie; vraag zo nodig bij Bullshooter naar een ondersteunde integratie. Er zijn geen login, CAPTCHA of toegangsmaatregelen omzeild.

## 5. Verified available data

### Proof of concept: daadwerkelijke herkenning

| Controle | Gecontroleerde waarde uit het report |
| --- | --- |
| League/seizoen | REU327 — Reusel 3e Divisie 2627, seizoen 2026/2027 |
| Reportdatum uitslagen | 3 oktober 2026, 06:33; tijdzone niet vermeld |
| NSJL-stand | 7e getoonde rij; 42 games, 8 gewonnen, 19,0%; 34 verloren afgeleid |
| Wedstrijd | 1 oktober, week 2: Bonn 5 — NSJL, 16–5; thuis/uit bevestigd via schema |
| Speler X01 | Colin Tielemans: PPD 17,86; 10 games; 4 wins; 13 LTon |
| Dezelfde speler Cricket | MPR 2,21; 8 games; 2 wins; 2 × 5MR; 1 × 6MR |
| Volgende reguliere wedstrijd | 15 oktober 2026, week 4, NSJL thuis tegen Saloon 5.2, The Saloon |
| Reportdatum schema | 31 augustus 2026, 19:38; tijdzone niet vermeld |

Bronnen: [3, 5]. De reportstand is geen live garantie en de positie is afgeleid uit bronvolgorde, geen apart aangeleverd rangnummer.

### Wat de lokale proef controleerde

De Python-auditprobe werkt offline op rechtstreeks opgehaalde HTML. Hij ontdekt beide iframe-URL’s, controleert league-identiteit, selecteert tabellen op exacte headers, leest reportdatums in maand/dag/jaar-notatie, herkent NSJL, vergelijkt spelers’ teamcontext en draagt datum/speelweek over naar de onderliggende schemaregels. Alle assertions slaagden. Dit is uitsluitend een analyseprobe, geen productie-importer of database-import.

De proef telde negen standregels, vijf NSJL-spelers met X01 én Cricket en achttien ingeplande NSJL-wedstrijden. Het schema bevat tien teams. Het report vermeldt ontbrekende uitslagen; het team zonder resultaat is dus niet automatisch uit de competitie verdwenen. Validatie mag niet blind tien standregels eisen. Een roster uit het schema blijft leidend voor deelname.

De uitslagenbron heeft SHA-256 `8bc50dd6ce57b0e5bb628d89bbd41bf4ecafbab01d2b172e308b17628b2dfc5d`; de schemabron `b4b6fc377949ec2f497fbf5c55f6414356afa97ce925e9826f35be18c32d4a85`. Deze hashes identificeren de onderzochte snapshots; ze zijn geen URL-discoverystrategie.

### Datamapping en grenzen

| Gegevensgroep | Daadwerkelijk aanwezige velden | Verwerking |
| --- | --- | --- |
| Stand | Team, Win %, Games, Wins | Positie uit bronvolgorde; losses alleen waar games minus wins inhoudelijk geldig is |
| Laatste resultaten | Team, Against, Date, Week, Games, Wins, Losses, Forfeits | Team-perspectieven samenvoegen; resultaat alleen met bevestigde opponent/context |
| X01 | Player, Team, PPD, Games, Wins, Hats, 3BD, Ton80, HTon, LTon, 9DO t/m 15DO | 6DO/7DO/8DO ontbreken in dit report: NULL, geen nul |
| Cricket | Player, Team, MPR, Games, Wins, Assists, Hats, WHorse, 5MR t/m 9MR | X01-Hats en Cricket-Hats apart bewaren |
| Verbeteringssecties | Vorige en huidige PPD/MPR, verbetering | Optioneel tonen; geen vervanging voor volledige statistiektabel |
| Schema | Week, Date, Home, Away, At, Notes | Datum/week doorgeven aan volgende teamregels; lege ronde niet als wedstrijd aanmaken |
| Team-info | Teams, roster, captain, locatie, adres en contactgegevens | Team-/locatiealiases; contactnummers standaard niet overnemen of publiceren |

De X01-sectietitel noemt PPR maar de feitelijke kolom heet PPD. De kolom bepaalt de mapping. Games/wins betreffen games of legs, geen aantal gewonnen teamwedstrijden. Er zijn geen individuele wedstrijdstatistieken, dart-tellingen, realtime scores of volledige uitslagenhistorie aangetroffen. PPD/MPR niet ongewogen tot een “teamgemiddelde” middelen; benodigde gewichten ontbreken.

Het schema maakt toekomstige wedstrijden goed uitleesbaar, inclusief thuis/uit en locatie. Een aanvangstijd ontbreekt: zet die op onbekend, niet automatisch op 20:00. Op 8 oktober staat een ronde met bekernotitie zonder concrete reguliere NSJL-pairing. Toon daarvoor geen verzonnen tegenstander. Verplaatsingen en wijzigingen blijven afhankelijk van publicatie door Bullshooter. Fallback: admin kan een expliciete schemacorrectie toevoegen.

Een belangrijk concreet mappingrisico: Tim Goossens staat in dit reguliere seizoen bij Saloon 5.2, terwijl hij een bestaand NSJL-profiel heeft [3, 6]. Persoonsidentiteit en teamlidmaatschap zijn verschillende relaties. Een naamovereenkomst geeft geen toestemming om die scores bij NSJL op te tellen. Ook teamnamen verschillen tussen bronnen, zoals Bonn 5 en D’n Bonn 5. Gebruik gecontroleerde aliases.

## 6. Proposed architecture

Er zijn twee realistische routes:

| Optie | Sterkte | Beperking |
| --- | --- | --- |
| Statische GitHub-site behouden plus Supabase API/worker | Minder wijziging aan hosting en oorspronkelijke HTML | Beheer, servervalidatie, SEO voor detailpagina’s en externe sync verdeeld over meerdere runtimes |
| Next.js/TypeScript plus Supabase en Vercel | Eén typed applicatie voor publieke site, admin, API en synchronisatie | Nieuwe build/deployment en domeinomzetting nodig |

**Gekozen: optie 2.** De React-map vormt geen belangrijke productieafhankelijkheid, terwijl de gevraagde beheer- en detailpagina’s baat hebben bij een geïntegreerde serverlaag. Neem de actieve HTML-content en stijl mee; begin niet vanuit het generieke prototype.

| Laag | Definitieve keuze en taak |
| --- | --- |
| Website/admin | Next.js App Router en TypeScript; CSS-variabelen voor herkenbare NSJL-stijl |
| Backend | Node-runtime route handlers en serverfuncties in dezelfde app; gedeelde services |
| Database | PostgreSQL bij Supabase in een beschikbare EU-regio |
| Queries/migrations | Drizzle; gereviewde SQL-migrations in git; geen ongecontroleerde schema-push naar productie [9] |
| Authentication | Supabase Auth, e-mail/wachtwoord, invite-only, TOTP voor beheer [10, 11] |
| Media | Supabase Storage met aparte publicatie- en private buckets [12] |
| Hosting | Vercel, previews gescheiden van productie |
| Scheduler | Supabase Cron/pg_cron + pg_net naar beveiligde Next.js-route [13, 14] |
| Contact | Bestaande Formspree-integratie aanvankelijk behouden |
| Parser | Server-side HTML-DOM-parser, bijvoorbeeld Cheerio; onafhankelijke providerinterface |

De gegevensstroom is: Bullshooter-ingangen → URL-discovery → BullshooterProvider → LeagueLeaderParser → validatie → SyncService → PostgreSQL → publieke queries/admin. De scheduler en de adminactie roepen dezelfde SyncService aan. De API is geen rechtstreekse proxy van Bullshooter. Next.js ondersteunt serverfuncties en Node-deployment; een statische export volstaat niet voor deze architectuur [7].

## 7. Database schema

Dit is het voorgestelde relationele eindmodel voor migrations, nog niet aangemaakt. UUID-primary keys tenzij vermeld; `created_at` en `updated_at` op wijzigbare tabellen. Timestamps gebruiken `timestamptz`; wedstrijddatums zonder bekende tijd gebruiken `date` plus een nullable tijd. Namen/slugs zijn tekst, aantallen integers, percentages/gemiddelden `numeric`. Onbekend is NULL. Foreign keys krijgen indexes; verwijderingen van competitiehistorie worden standaard geblokkeerd.

| Tabel | Velden naast ID/timestamps | Belangrijkste relaties/constraints |
| --- | --- | --- |
| `users` | name, email, role, is_active, last_login_at | ID = FK naar `auth.users`; e-mail uniek; geen eigen password_hash |
| `players` | first_name, last_name, display_name, nickname, slug, photo_media_id, bio, is_active, sort_order | slug uniek; foto FK media |
| `competitions` | name, slug, source, external_identifier | slug uniek; reguliere en zomercompetitie afzonderlijk |
| `seasons` | competition_id, name, starts_at, ends_at, is_current, status | uniek (competition_id, name); maximaal één current per competition |
| `divisions` | season_id, name, slug, external_identifier, source_url | uniek (season_id, slug); league-identiteit per bron/seizoen vastgelegd |
| `teams` | name, normalized_name, slug, is_nsjl | slug uniek; geen wereldwijd unieke naam afdwingen |
| `team_seasons` | team_id, division_id, external_identifier, is_primary_nsjl, venue_id | division bepaalt season; uniek (team_id, division_id); maximaal één primary NSJL per division |
| `team_aliases` | division_id, team_season_id, source, external_name, normalized_name | uniek (division_id, source, normalized_name) |
| `venues` | name, address, postal_code, city, country, is_active | Geen captaintelefoons nodig voor bezoekers |
| `venue_aliases` | source, competition_id, external_name, normalized_name, venue_id | unieke scoped alias |
| `player_team_seasons` | player_id, team_season_id, joined_on, left_on, role | lidmaatschap per context/periode; geen automatische overgang bij nieuw seizoen |
| `player_aliases` | player_id, source, division_id, team_season_id, external_identifier, external_name, normalized_name | unieke bronnaam binnen team/divisiecontext; collisions expliciet blokkeren |
| `external_players` | source, team_season_id, external_identifier, external_name, normalized_name, player_id nullable, first_seen_report_id, last_seen_report_id | staging voor ongekoppelde spelers; unieke bronidentiteit in context |
| `standings` | team_season_id, position nullable, position_basis, games, wins, losses nullable, win_percentage, source_report_id, synced_at | team_season_id uniek; nonnegative; wins <= games; percentage 0–100 |
| `matches` | division_id, week_number nullable, round_key, import_key, pairing_number, scheduled_date nullable, played_date nullable, start_time nullable, home_team_season_id nullable, away_team_season_id nullable, home_score nullable, away_score nullable, status, venue_id nullable, source, external_identifier nullable, result_report_id nullable, schedule_report_id nullable, synced_at | team_seasons moeten in dezelfde division vallen; teams verschillend; uniek (source, division_id, import_key) |
| `match_result_sides` | match_id, team_season_id, games, wins, losses, forfeits, source_report_id | uniek (match_id, team_season_id); behoud team-perspectief vóór bevestigde thuis/uit-score |
| `player_season_stats` | external_player_id, player_id nullable, team_season_id, x01_ppd, x01_games, x01_wins, x01_hats, x01_3bd, x01_ton80, x01_hton, x01_lton, x01_6do t/m x01_15do, cricket_mpr, cricket_games, cricket_wins, cricket_assists, cricket_hats, cricket_whorse, cricket_5mr t/m cricket_9mr, source_report_id, synced_at | uniek external_player_id; membership/context controleren; numerieke kolommen, geen statistiekblob |
| `news_posts` | title, slug, excerpt, content, featured_media_id, category, status, published_at, author_id | slug uniek; draft/published; server-side sanitization |
| `events` | title, description, starts_at, ends_at nullable, location, event_type, created_by | training/tournament/team_event/other; competitiematches niet dupliceren |
| `sponsors` | name, logo_media_id, website_url, description, is_active, sort_order | logo FK media; URL-validatie |
| `media` | filename, storage_path, bucket, mime_type, size, width, height, alt_text, uploaded_by | uniek (bucket, storage_path); upload-/publicatiestatus toevoegen |
| `source_configs` | division_id, provider, results_entry_url, schedule_entry_url, teaminfo_entry_url, enabled, expected_league_code, expected_source_division | uniek provider/division; providerbeleid uit code, geen vrij invulbare hostallowlist |
| `source_reports` | source_config_id, report_type, discovered_url, report_datetime_local, report_timezone nullable, reported_at_utc nullable, fetched_at, sha256, parser_version, snapshot_storage_path nullable, status | uniek (source_config_id, report_type, sha256); originele datum bewaren |
| `sync_runs` | source_config_id, trigger_type, status, started_at, finished_at, result_report_id, schedule_report_id, records_found/created/updated/skipped, error_code, error_message | running/success/warning/failed; log blijft behouden bij rollback van gegevens |
| `sync_locks` | source_config_id, owner_run_id, lease_until | source_config_id PK; exclusieve lease via atomische databasehandeling |
| `data_overrides` | match_id nullable, team_season_id nullable, player_stat_id nullable, field_name, numeric_value nullable, text_value nullable, date_value nullable, reason, expires_at nullable, created_by, is_active | precies één doel-FK; toegestane velden via allowlist/check; import blijft afzonderlijk |
| `audit_logs` | actor_user_id nullable, action, entity_type, entity_id, occurred_at, summary | append-only; geen secrets of volledige berichten loggen |
| `site_settings` | key, value_text nullable, value_number nullable, value_boolean nullable, value_media_id nullable | key uniek; getypeerde instellingen; geen vervanging voor nieuws/spelers |

`standings_history` en `player_stats_history` bewaren dezelfde getypeerde meetvelden plus hun bronrapport, uniek per team/speler en report. Hiermee blijven tussentijdse snapshots en correcties controleerbaar; de hoofdtabellen geven de laatste goedgekeurde toestand. Afgeronde seizoenen behouden hun eigen hoofdrecords en historie. Nieuws en media krijgen soft-delete/archivering waar praktisch, geen cascades die oude berichten of statistieken wissen.

Na persoonskoppeling geldt aanvullend een unieke (player_id, team_season_id)-constraint voor gekoppelde statistieken. Nieuwe spellingaliases verwijzen naar dezelfde canonieke bronpersoon; zij leveren geen extra spelerskaart of dubbele teamtotalen op. Conflicterende bronpersonen worden eerst beoordeeld. Legacy-spelerswaarden zonder bewezen context krijgen een aparte `legacy_player_stats`-stagingtabel met player_id, origin_file, claimed_competition_id/season_id nullable, ppd, mpr, wins, hats, verification_status en verified_by; zij tellen niet mee in officiële seizoenqueries.

**Bewuste afwijkingen van de blauwdruk:** season_id wordt niet onnodig herhaald waar division_id het al bepaalt. Composite foreign keys of databasechecks bewaken dat deelnemende teams bij dezelfde divisie horen. Statistieken zijn teamgebonden: uniek (player_id, season_id, division_id) is onvoldoende wanneer een speler van team wisselt. Bronidentiteit en intern profiel blijven gescheiden. Auth beheert wachtwoorden; de eigen `users`-tabel beheert rechten. DO-kolommen lopen verder door dan de oorspronkelijke voorbeeldlijst.

**Wedstrijdidentiteit:** bij een echte bron-ID die gebruiken. Anders division + ronde/speelweek + canoniek team-paar, aangevuld met pairingvolgnummer indien nodig. Datum is geen primaire identiteit omdat een wedstrijd kan worden verplaatst. Matchen van een uitslag gebeurt eerst tegen een bestaande schemapairing. Zonder betrouwbare ronde/pairing gaat het record naar review. Beide tegenpartijregels verwijzen naar één wedstrijd, geen twee imports. Geen thuis/uit afleiden uit de volgorde van `Last Match Results`.

## 8. Authentication & admin

`/admin/login` gebruikt Supabase Auth met e-mail/wachtwoord. Registratie is uitgeschakeld; de eerste beheerder wordt via een veilige bootstrap/invite toegevoegd, niet met een wachtwoord in git. TOTP wordt verplicht voor beheerders. Password reset en invites gebruiken SMTP dat in Supabase wordt ingesteld [11, 16].

Alle adminpagina’s, route handlers en serverfuncties controleren server-side een gevalideerde Auth-identiteit, MFA-niveau en de actuele eigen `users.role/is_active`. Een frontendredirect of JWT met verouderde rol is onvoldoende. Terugtrekken van rechten werkt door de actuele databasecheck bij iedere beheermutatie. Next.js waarschuwt expliciet dat serverfuncties rechtstreeks via POST bereikbaar zijn [17].

Voorgesteld sessieontwerp: server-only Auth-client voor admin; tokens in Secure, HttpOnly, SameSite-cookies, refresh gecontroleerd in de serverlaag, geen auth-tokens in localStorage of de clientbundle. Dit is een bewuste keuze voor serverbemiddelde adminacties: gebruik daarbij geen browser-SDK die cookies rechtstreeks moet lezen. Cookie-expiratie, logout, tokenrefresh en MFA-herstel krijgen integratietests. Als later browser-side Supabase Auth wordt toegevoegd, moet dit sessieontwerp opnieuw expliciet worden beoordeeld.

Rollen starten met admin; editor kan later beperkt contentbeheer krijgen. Ongekoppelde bronspelers verschijnen in `/admin/spelers/koppelingen`. Normaliseer Unicode, hoofdletters en whitespace, maar verwijder niet agressief onderscheidende tekens. Exacte goedgekeurde aliases binnen bron/team/seizoen koppelen automatisch. Fuzzy matching doet alleen voorstellen. Onbekende spelers worden niet automatisch interne profielen. Conflicten of dubbelzinnige namen vragen beheerreview. Het aanmaken van een profiel door de beheerder is een aparte expliciete actie.

## 9. Bullshooter sync architecture

### Exacte pipeline

1. Authenticeer scheduler of beheerder; pas cooldown toe en verkrijg een databaselease voor deze bron/divisie. Maak een sync-run buiten de datasettransactie.
2. Fetch de vaste Bullshooter-ingangen met herkenbare user agent, timeout, maximale documentgrootte en conditionele requests via ETag/Last-Modified waar ondersteund.
3. Discover iframe- of expliciete reportlink; resolve relatieve URLs; controleer schema, host, poort, pad en redirects. Alleen vooraf toegestane publieke bronnen. Gebruik nooit een willekeurige admin-URL als vrij fetchdoel.
4. Download resultaten en zo nodig het schema. Een onveranderd hash kan parsing overslaan, maar na een nieuwe parser-versie of noodzakelijke aliasreview moet herverwerking mogelijk blijven.
5. Lees metadata: league-code, seizoen, interne division, reportdatum en alle verwachte secties. Bewaar brontijdzone als onbekend als die ontbreekt; presenteer geen verzonnen UTC-brontijd.
6. Parse typed records op headers/secties; normalize namen; carry-forward schemaweek/datum; sla lege vakantierondes over. Bewaar originele bronnaam naast de genormaliseerde.
7. Resolve teams en spelers binnen de juiste context. Gebruik het schema voor thuis/uit. Dedupliceer team-perspectieven van dezelfde uitslag. Markeer onbekende spelers voor review.
8. Valideer aantallen, identiteit, datums, numerieke ranges, duplicate keys, opposing scores en onverwachte verschillen. Vergelijk met laatste succesvolle snapshot; ontbrekend schema-onderdeel hoeft geldige resultaten niet te blokkeren, maar wordt afzonderlijk afgekeurd.
9. Start één transactie per goedgekeurde gegevensgroep/report. Upsert roster, matches, standen en getypeerde statistieken; voeg histories toe; verwijder niets wegens bronafwezigheid. Seizoenovergang gaat naar review voordat een nieuwe context actief wordt.
10. Commit. Werk sync-run bij, geef lease vrij en vernieuw relevante publieke caches. Cachevernieuwing die faalt wordt apart herhaald; een geslaagde import wordt daardoor niet teruggedraaid.

### Foutbeleid

Een lege pagina, onbekende headers, verkeerde league, nul teams na een geldige eerdere stand of een onverwacht ontbrekend NSJL blokkeert de betreffende import. Oudere reportdatums overschrijven niets. Dezelfde reportdatum met veranderde inhoud kan een correctie zijn en krijgt diff-validatie. Daling van season totals kan eveneens een correctie zijn: geen blind monotoniciteitsverbod, maar bij grote verschillen eerst review.

Een team kan aan het begin van het seizoen in de stand ontbreken door ontbrekende resultaten. Daarom geen hardcoded verwachting van 11 teams en geen teamverwijdering op basis van de stand. Bij een geldig NSJL-resultaat maar onbekende speler kunnen wedstrijd/stand worden bijgewerkt, terwijl de ongekoppelde statistieken in staging blijven. Logs maken die gedeeltelijke status duidelijk.

De publieke site toont de laatste succesvolle databasegegevens met controledatum en eventueel “gegevens mogelijk verouderd”. Een fetchfout wordt niet als lege competitie getoond. “Geen nieuwe gegevens gevonden” is een succesvolle controle; geen fout en geen kunstmatig gewijzigde bron-datum.

### Scheduler

Voorstel: één Supabase Cron-job op `15 */4 * * *` (UTC), dus zes checks per dag, voor de actieve reguliere context. pg_net POST naar `/api/internal/sync/bullshooter`, met een servergeheim uit Supabase Vault en hetzelfde geheim in Vercel. Start geen langdurige job met een los, niet-afgewacht promise na de HTTP-response. Voer deze kleine import binnen de gemeten functielimiet uit; grotere backfills later via een worker.

Resultaten worden iedere run gecontroleerd; schema en team-info eenmaal per dag of handmatig, met cache/conditionele requests. Admin “Nu synchroniseren” deelt dezelfde lock en bijvoorbeeld tien minuten bron-cooldown. Respecteer Retry-After bij 429, backoff bij tijdelijke storingen en begrens retries. Regelmaat bewijst geen realtime verwerking: Bullshooter moet eerst publiceren.

Supabase Cron ondersteunt HTTP-aanroepen; pg_cron/pg_net en Vault zijn gedocumenteerd [13, 14]. Gebruik hiervoor niet Vercel Hobby Cron met een vieruursinterval: dat plan staat voor eigen cron-jobs maximaal dagelijkse uitvoering toe [15]. HTTP-schedulerstatus is bovendien niet hetzelfde als importsucces: monitor zowel cron/net-responses als `sync_runs`, inclusief uitblijvende succesvolle runs.

## 10. Admin Dashboard

| Scherm | Functies |
| --- | --- |
| `/admin` | Geselecteerde competitie/seizoen, positie, winpercentage, laatste uitslag, volgende wedstrijd, laatste controle en laatste nieuwe brondata; quick actions |
| `/admin/synchronisatie` | Nu synchroniseren, loglijst, run-details, wijzigingen, waarschuwingen, parser-versie en bronlinks |
| `/admin/spelers` | Profielen, foto, nickname, status, sortering en teamlidmaatschap per seizoen |
| `/admin/spelers/koppelingen` | Onbekende bronspelers, aliasvoorstellen, expliciete koppeling en conflictresolutie |
| `/admin/wedstrijden` | Schema/resultaten, seizoenfilter, matchdetail, verplaatsingen en duidelijke overrides |
| `/admin/stand` en `/admin/statistieken` | Bronwaarden, filters en controles; geen onbedoelde overschrijving van imports |
| `/admin/nieuws` | Concept/publicatie, titel, samenvatting, inhoud, afbeelding, categorie, publicatiedatum en preview |
| `/admin/agenda` | Training, toernooi en teamactiviteiten; schema ernaast tonen zonder duplicatie |
| `/admin/media` en `/admin/sponsors` | Uploads, alt-tekst, publicatiestatus, logo’s en links |
| `/admin/instellingen` | Homepage/contactteksten, huidige competitiecontext, bronconfiguratie en gebruikersbeheer |

Desktop krijgt een gelabelde sidebar. Mobiel krijgt een compacte navigatie met Dashboard, Wedstrijden, Nieuws, Spelers en Meer. Kritieke acties vereisen geen horizontaal scrollen. De synckaart zegt “Laatste synchronisatie succesvol”, niet “Verbonden” alsof er een permanente verbinding bestaat. Een uitgestelde of ontbrekende uitslag blijft herkenbaar.

## 11. Public website changes

Behoud de hero, humor, logo’s, teamkaarten en nieuwsinhoud. Vervang handmatige cijfers door contextgebonden queries. Bovenaan: gekozen competitie/seizoen, relevante statistieken, volgende wedstrijd en laatste bevestigde uitslag. Daarna stand, spelers, nieuws, agenda, sponsors en contact.

Publieke routes: `/stand`, `/wedstrijden`, `/wedstrijden/[slug]`, `/spelers/[slug]`, `/statistieken` en `/nieuws/[slug]`. Voeg seizoen-/competitie-selectors toe. Bewaar bestaande homepage-ankers zodat oude links bruikbaar blijven. Maak Team/Spelers-benaming consistent; geef eventuele prototyperoutes redirects als ze daadwerkelijk gebruikt worden.

“Gewonnen” krijgt het label “Games gewonnen” waar dat de bronbetekenis is. Bij gemengde statistieken worden X01- en Cricket-wins onderscheiden. Laat Teamleden tellen uit lidmaatschap, niet uit de toevallig actieve spelers in een report. NSJL wordt in de stand gemarkeerd. Mobiele standen worden compacte rijen/kaarten. Vermeld Bullshooter Events als bron en laat zowel brondatum als laatste succesvolle controle zien.

Nieuws en spelerpagina’s krijgen eigen metadata, canonical, Open Graph en sitemap. Admin en previews worden niet geïndexeerd. Render essentiële content op de server; verbeter afbeeldingen en fonts en respecteer reduced motion. Formspree blijft eerst behouden, inclusief bestaande ontvangstconfiguratie, terwijl labels en statusfeedback worden verbeterd.

## 12. Security

| Onderdeel | Noodzakelijke maatregel |
| --- | --- |
| Authenticatie/rechten | Invite-only, MFA, gevalideerde sessie en actuele server-side rolcheck voor iedere mutatie |
| Sessies/CSRF | Secure/HttpOnly/SameSite; POST voor mutaties; Origin-check en CSRF-bescherming voor cookie-auth; geen state changes via GET |
| XSS | Escape brondata; sanitize nieuwstekst; toegestane rich-text-tags; CSP met passende bronnen en nonces |
| SQL | Parameterized Drizzle-queries; gevalideerde filters; geen SQL samengesteld uit bron- of formuliertekst |
| Database | Geen browser-writepad; RLS/privileges sluiten anon-toegang; aparte minimale serverrollen voor reads, admin en sync waar passend |
| ORM-autorisatie | Directe server-DB-verbinding krijgt niet automatisch de Auth-JWT-context; rechten moeten expliciet in services en DB-grants worden afgedwongen |
| Rate limiting | Gedeelde limiter voor login, sync en uploads; geen uitsluitend in-memory limiet in serverless instances |
| SSRF/import | HTTPS-hostallowlist, poort/padcheck, redirectvalidatie, private/link-local adressen blokkeren, max grootte en timeout |
| Uploads | MIME én bestandssignatuur, grootte/pixelgrenzen, willekeurige bestandsnaam, re-encoding; geen ongecontroleerde SVG/HTML/executable uploads |
| Media | Private originelen/bronfixtures; alleen gepubliceerde veilige afbeeldingen publiek; storage policies |
| Secrets | Alleen hostingvariabelen/Vault; geen secret in clientbundle, git, chat of logs |
| Headers | HSTS, CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors; adminresponses niet publiek cachen |
| Persoonsgegevens | Captaintelefoons niet automatisch publiceren; minimale contactretentie; privacyinformatie en beheerlog zonder gevoelige payloads |
| Dependencies | Lockfile, actuele ondersteunde releases, CI-audit en periodieke updates |

RLS is geen bescherming tegen een serververbinding met een bypass-role. Die rol moet beperkt worden gebruikt; algemene routes gebruiken geen brede servicecredentials. Contact heeft momenteel browservalidatie en Formspree als serverpartij; diens aflevering/spamconfiguratie moet in acceptatie gecontroleerd worden zonder deze tijdens de audit te wijzigen.

## 13. Deployment

Gebruik de bestaande GitHub-repository als bron, een afzonderlijke V2-branch en previewdeployments. Vercel bouwt Next.js; Supabase verzorgt PostgreSQL, Auth, Storage en Cron. Kies EU-regio’s voor database en waar ondersteund serveruitvoering. Staging krijgt eigen database/auth/storage; previews krijgen nooit automatisch productiesecrets of productiecron.

Productieadvies: een Supabase-plan dat backups en beschikbaarheid ondersteunt. Gratis projecten kunnen gepauzeerd worden en hebben geen automatische beschikbare databasebackups; eigen off-site exports zijn dan noodzakelijk [16, 18]. Vercel-plan hangt ook af van de toegestane gebruikscategorie. Er wordt geen gratis productiegarantie of exact maandbedrag beloofd. Controleer actuele kosten, gebruiksvoorwaarden en budget vóór activering.

**Environment-contract voor latere `.env.example`:**

| Naam | Gebruik/geheim |
| --- | --- |
| `APP_URL` | Canonieke site-URL; niet geheim |
| `DATABASE_URL` | Server-DB-verbinding via geschikte pooler; geheim |
| `DATABASE_MIGRATION_URL` | Verbinding met migrationsrechten; alleen releaseproces; geheim |
| `SUPABASE_URL` | Server/Auth/Storage-projectadres; niet geheim |
| `SUPABASE_PUBLISHABLE_KEY` | SDK-projectkey; niet geheim, maar geen toegangsbewijs voor cron |
| `SUPABASE_SECRET_KEY` | Alleen waar beheer/bootstrap/media dit vereist; server-only geheim |
| `SYNC_CRON_SECRET` | Beveiligde scheduler-aanroep; geheim en tevens in Vault |
| `BULLSHOOTER_RESULTS_ENTRY_URL` | Stabiele uitslageningang; geen snapshot-URL |
| `BULLSHOOTER_SCHEDULE_ENTRY_URL` | Stabiele schema-ingang |
| `BULLSHOOTER_TEAMINFO_ENTRY_URL` | Team-info-ingang |
| `FORM_SPREE_ENDPOINT` | Bestaande publieke form action |
| `SYNC_ENABLED` | Schakelaar per omgeving |

SMTP-host, poort, username, password en sender worden veilig in Supabase Auth ingesteld, niet in de frontend. Lokale echte `.env`-bestanden worden genegeerd; de latere `.env.example` bevat uitsluitend lege of veilige voorbeeldwaarden. Deze audit maakt geen credentials of hostingresources aan.

Releasevolgorde: typecheck/tests/build → backup → gereviewde migrations met aparte releasecredentials → appdeploy → smoke test → cron gecontroleerd activeren. Geen migrations laten concurreren in ieder preview-buildproces. Monitor fouten, stale syncs en kosten. Dagelijkse DB-backup met minimaal afgesproken retentie, afzonderlijke media-backup en een geteste restoreprocedure zijn onderdeel van productieacceptatie. Databasebackups zijn geen garantie dat Storage-objecten worden teruggezet.

Pas na acceptatie `nsjl.nl` naar de nieuwe host omzetten. Laat MX/TXT-mailrecords intact. Bewaar de oude statische site en domeininstellingen voor rollback. Een approllback draait niet zomaar incompatibele databasewijzigingen terug; gebruik uitbreiden/migreren/opschonen in afzonderlijke stappen.

## 14. Migration strategy

1. Bewaar oorspronkelijke ZIP en alle oorspronkelijke bronbestanden/assets. Maak een contentinventaris met herkomst en importstatus.
2. Seed drie bestaande nieuwsberichten en vier echte spelersprofielen. Migreer contactinformatie en logo’s. Fictieve React-spelers, demonstratiescores en emoji-galerij niet als echte data aanmaken.
3. Maak een aparte zomercompetitie 2026. Leg de twintig bestaande standregels vast als legacy-snapshot. De koppels zijn verschillende teams; markeer alleen Tim en Mike als de op de huidige site gebruikte NSJL-context nadat dit gecontroleerd is.
4. Bewaar bestaande spelerstatistieken met herkomst “legacy website”. De HTML geeft geen expliciete competitie-/seizoenrelatie voor iedere spelerskaart; verbind die niet zonder bevestiging aan zomer 2026 of reguliere competitie. Onbevestigde legacywaarden blijven in een gestructureerde stagingimport totdat de context duidelijk is.
5. Behoud de uitgeschakelde historische schema-/scorecontent in het bronarchief. Zet die niet automatisch om in complete wedstrijden: tegenstanders en context ontbreken deels. Laat bruikbare historische gegevens expliciet beoordelen.
6. Bouw reguliere competitie 2026/2027 als aparte context uit de gevalideerde Bullshooterbron. Review team- en speleraliases, inclusief Tim Goossens’ teamcontext en spelers die in het nieuwe roster staan maar nog geen bestaande profielkaart hebben.
7. Draai importer eerst in dry-run/shadow mode. Vergelijk counts, scores, schema en statistieken met de originele reports. Beheer/publicatie gaat via staging, productie blijft intact.
8. Laat content, mobiel beheer en rechten accepteren. Pas daarna productiecutover; bewaar een herstelbare legacyversie.

Een nieuw seizoen krijgt nieuwe season/division/team_season-records. Discovery van een andere league zet een nieuwe context klaar voor review en wijzigt nooit oude season IDs. Eerdere volledige seizoenen kunnen alleen worden geïmporteerd als daarvoor complete bronnen of exports beschikbaar zijn. De huidige “Last Match Results”-sectie kan gemiste weken niet vanzelf reconstrueren.

## 15. Testing strategy

**Tijdens de audit gedaan:** alle projectbestanden gelezen, live HTML met ZIP vergeleken, formuliercode beoordeeld zonder verzending, iframe-discovery uitgevoerd, reports rechtstreeks opgehaald en lokale parserassertions gedraaid. Stand, resultaat, spelerteam, X01, Cricket, schema en reportdatums zijn herkend. Geen npm-build gerund: daarvoor ontbreken manifest en buildconfiguratie. Geen productie-import of deployment uitgevoerd.

**Automatisch in implementatie:**

- Parserfixtures: huidig report, headerwijziging, oude reportdatum, errorpagina, leeg HTML, ongeldige getallen, naamwhitespace, ontbrekende statisticuskolom en onbekende speler.
- Broncontext: verkeerde league, nieuw seizoen, bronaliascollision, team zonder uitslag, Tim bij een ander team, geen 6DO-kolom en datum in maand/dag/jaar.
- Schema: datum/week doorgeven, vakantierondes, ontbrekende tijd, verplaatsing, venue-alias en tegenovergestelde home/away-identiteit.
- Database: idempotente herimport, twee uitslagperspectieven één match, transactierollback, oude reportweigering, history, overrides en seizoenisolatie.
- Parallelle jobs: lease, verlopen lease, beheeractie tegelijk met cron, retry en monitoring van mislukte HTTP-aanroep.
- Beveiliging: anonieme en onbevoegde directe POST, gedeactiveerde admin, MFA, login/logout/refresh, CSRF, XSS, SSRF-redirects en onveilige upload.
- CRUD/publicatie en filters met een testdatabase; typecheck, lint en productiebuild in CI. Unit tests doen geen live Bullshooterrequests.

**Handmatig:** iPhone/Android/tablet/desktop, toetsenbordbediening, schermlezerlabels, mobiele stand/admin, datumweergave, media, bevestigde Formspree-aflevering via een afgesproken testbericht, backuprestore, rollback en domein/mailcontinuïteit. Fixtures gebruiken minimale noodzakelijke publieke data en worden niet met captaincontactgegevens verspreid.

## 16. Risks

| Risico/onzekerheid | Gevolg en aanpak |
| --- | --- |
| Externe HTML verandert | Parser kan stoppen; contracttests, versies, alarms en laatste succesvolle dataset |
| Geen API aangetroffen | HTML is externe afhankelijkheid; ondersteunde API later als andere provider mogelijk |
| Bronupdates vertragen/ontbreken | Geen livebelofte; bronbericht en freshness zichtbaar |
| Stand bevat minder teams dan roster | Geen automatische verwijdering; onderscheid deelname en beschikbare resultaten |
| Alleen laatste resultaten | Geen gegarandeerde volledige historische backfill; eigen snapshots vanaf start bewaren |
| Uitgestelde wedstrijden | Stabiele pairing-key en played/scheduled-datum apart; ambigue wijziging naar review |
| Naam/teamcontext | Geen globale naam-autokoppeling of teamtotalen van andere teams |
| Bron bevat geen tijdzone/tijd | Lokale reporttekst bewaren; onbekende starttijd niet invullen |
| Hosting/accountconfiguratie onbekend | Publieke GitHub-hosting vastgesteld, beheerinstellingen nog nodig bij cutover |
| Formspree-delivery onbekend | Integratiecode vastgesteld; afleveradres en abuse-instellingen later controleren |
| Kosten/planlimieten | Betaald productieadvies, actuele plancontrole en budgetafspraak |
| Gebruiksvoorwaarden bron | Toegestane importfrequentie/licentie vóór productie bevestigen; geen beveiliging omzeilen |

## 17. Implementation phases

Na goedkeuring: (1) architectuur vastleggen en repository/build op orde brengen; (2) database/migrations, Auth en media; (3) bronadapter/parser met fixtures; (4) SyncService, dry-run en logging; (5) mobiele admin en contentbeheer; (6) publieke databasekoppeling en behoud van identiteit; (7) migratiecontrole, security en volledige acceptatie; (8) deployment, backuprestore, cron en gecontroleerde cutover.

Elke stap heeft een toetsbaar resultaat. De audit is afgerond zodra dit voorstel beschikbaar is. Geen implementatiefase wordt door deze oplevering gestart.

## 18. Estimated complexity

| Fase | Complexiteit | Waarom / acceptatiepunt |
| --- | --- | --- |
| 1. Architectuur/build | Gemiddeld | Project heeft geen package/buildconfig; reproduceerbare preview en ontwerpbesluit |
| 2. Database/Auth/media | Hoog | Historie, constraints, serverrechten en sessies moeten samen kloppen |
| 3. Provider/parser | Gemiddeld | HTML-tabellen zijn bewezen; varianten, datumcontext en foutdetectie testen |
| 4. Synchronisatie | Hoog | Idempotentie, pairing, locks, rollback, partial status en correcties |
| 5. Admin | Hoog | Meerdere CRUD-flows, uploads, aliases en bruikbaar mobiel beheer |
| 6. Publieke site | Gemiddeld | Bestaande content/layout bruikbaar; queries, filters, detailroutes en SEO |
| 7. Migratie/acceptatie | Hoog | Onbekende historische context, security, datavergelijking en hersteltesten |
| 8. Deployment | Gemiddeld | Meerdere diensten, secrets, DNS/mail, scheduler en rollback |

Geen betrouwbare ureninschatting zonder het nog onbekende hostingbeheer, contentcontext en afgesproken adminscope. Technisch grootste risico zit in correcte context en foutafhandeling, niet in het tekenen van kaarten.

## 19. Decisions needed from me

Alleen informatie/keuzes die niet uit de code of openbare bronnen volgen:

1. Akkoord op Vercel + Supabase en het beschikbare maandbudget; eventuele bestaande betaalde hosting die verplicht moet blijven.
2. Akkoord op donker/groen als bewuste wijziging ten opzichte van de huidige wit/blauw/gouden productieversie.
3. Bevestig of Tim Goossens een NSJL-profiel blijft houden, en of statistieken van zijn andere team apart getoond mogen worden. Standaard telt V2 uitsluitend NSJL-teamcontext mee.
4. Welke competitie/periode hoort bij de vier bestaande spelersstatistiekkaarten? Zijn er complete oudere seizoensexports die later geïmporteerd moeten worden?
5. Welke beheerders mogen toegang krijgen, en klopt het huidige Formspree-ontvangstadres/abonnement? Alleen e-mailadressen/configuratie-informatie, geen wachtwoorden of API-keys in chat.
6. Bij latere cutover: wie beheert GitHub Pages en domein/DNS, en zijn er mailrecords die behouden moeten blijven? De toegang wordt via normale accountinstellingen geregeld.

### Bronnen en controleerbaarheid

Alle onderstaande publieke bronnen zijn tijdens deze audit geraadpleegd. Bronbestanden: de aangeleverde ZIP en twee specificaties. De lokale auditprobe en ruwe HTML blijven onderzoeksbestanden; dit document is de oplevering. De live HTML-identiteitscheck en reporthashes staan bovenaan/in sectie 5.

- [1] NSJL: https://nsjl.nl/
- [2] Bullshooter uitslageningang: https://www.bullshooterevents.nl/comp_reu3_uitslagen.html
- [3] Onderzocht uitslagenreport: https://www.bullshooterevents.nl/files/Competitie2627_Uitslagen/261003_REU3.html
- [4] Bullshooter schema-ingang: https://www.bullshooterevents.nl/comp_reu3_speelschema.html
- [5] Onderzocht schemareport: https://www.bullshooterevents.nl/files/Competitie2627_Speelschema%27s/Speelschema_REU3.html
- [6] Team-info: https://www.bullshooterevents.nl/comp_reu3_teaminfo.html
- [7] Next.js deployment: https://nextjs.org/docs/app/getting-started/deploying
- [8] GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- [9] Drizzle migrations: https://orm.drizzle.team/docs/migrations
- [10] Supabase server-side Auth: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- [11] Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- [12] Supabase Storage access: https://supabase.com/docs/guides/storage/security/access-control
- [13] Supabase Cron: https://supabase.com/docs/guides/cron
- [14] pg_cron/pg_net/Vault: https://supabase.com/docs/guides/functions/schedule-functions
- [15] Vercel cronlimieten: https://vercel.com/docs/cron-jobs/usage-and-pricing
- [16] Supabase productiecheck: https://supabase.com/docs/guides/deployment/going-into-prod
- [17] Next.js servermutaties/autorisatie: https://nextjs.org/docs/app/getting-started/mutating-data
- [18] Supabase backups: https://supabase.com/docs/guides/platform/backups

Klaar om NSJL V2 te bouwen. Wachtend op goedkeuring voor implementatie.
