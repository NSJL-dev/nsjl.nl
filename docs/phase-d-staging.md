# Fase D — stagingbeheer en persoonlijke acceptatietest

Bronbranch: `nsjl-v2`. Basiscommit: `546eaf68bb9ddc37f95decc45a5680b2ffc38703`.
Uitsluitend Supabase `nsjl-v2-staging`, project `qlmnqoeyhmljizxibyky`.
Geen wijziging aan publieke componenten, publieke databinding, schema-definities,
seeddata, importer, syncservice, Storage-policies, Auth-configuratie of Vercel-configuratie.
`SYNC_ENABLED=false` blijft de vereiste staginginstelling.

Het mediamodel hieronder beschrijft de eerdere Fase-D-implementatie. De latere
goedgekeurde wijziging vervangt ondertekende previews en openbare kopieën door
gecontroleerde byte-routes. Zie [huidige mediatoegang en stagingtest](media-access-staging.md).

## Gebouwd en lokaal bewezen

- Handmatige en scheduler-sync weigeren met HTTP 403 voordat een database,
  provider of importer wordt aangeroepen wanneer synchronisatie uitstaat.
  De bronactivering, syncknop en CLI-bronophaling/auditimport zijn eveneens geblokkeerd.
- Server-side geverifieerde identiteit, actief adminregister, bevestigde e-mail
  en AAL2 zijn verplicht voor beheermutaties. Clientmetadata verleent geen rol.
- Vernieuwde cookies bereiken zowel de huidige server-render als de browser.
  HttpOnly, Secure op staging/HTTPS, SameSite=Lax en private/no-store blijven vereist.
  Publieke CSP/nonce-headers zijn behouden; publieke requests vernieuwen geen sessies.
- Invite/recovery-callbacks accepteren alleen invite/recovery, geen signup.
  Wachtwoordherstel heft een bestaande MFA-verplichting niet op.
- MFA-enrollment ruimt alleen eigen onvoltooide TOTP-factoren op. Verificatie
  controleert factorbezit en bevestigde AAL2 voordat toegang wordt verleend.
- Nieuwsconcepten, bewerken, publiceren, intrekken en archiveren zijn transactioneel.
  HTML wordt gesaneerd; profiel-URL's en nieuwspermalinks blijven bij titel/naamwijziging behouden.
- Profielbeheer maakt geen teamlidmaatschap of alias aan; Tim blijft afgebakend.
- Contact/hero-instellingen zijn gevalideerd; beheerformulieren behouden invoer bij fouten.
- Automatische bronrecords blijven intact: handmatige correcties zijn aparte overrides met reden.
- Afbeeldingen worden daadwerkelijk gedecodeerd, begrensd en metadata-vrij naar WebP omgezet.
  Uploads starten privé met UUID-pad; publiceren maakt een aparte openbare kopie.
  Intrekken/archiveren behoudt het privé-origineel.
- Een mislukte DB-transactie compenseert de Storage-write. Als compensatie zelf faalt,
  meldt de app expliciet dat Storage handmatig gecontroleerd moet worden.
- Privé bekijken vereist AAL2 en geeft een niet-gecachete leeslink van 60 seconden.
  Zo'n link kan tot zijn vervaldatum worden gebruikt; deel hem niet buiten beheer.
- Beheer- en Auth-auditregels bevatten acties, geen wachtwoorden, tokens, OTP's of berichtinhoud.
  `/admin/audit` toont de laatste 100 regels. Bestaande DB-triggers weigeren UPDATE/DELETE.

## Checks en grenzen van het bewijs

Typecheck PASS, lint PASS, volledige suite PASS: **252 tests in 16 bestanden**.
Daarvan zijn 106 nieuwe Fase-D-tests: Auth 32, syncgating 3, media 16,
beheerflows/migration 19, beheer-HTTP 21, beheer-SSR 15.
Secrets-check en `git diff --check`: PASS.

Deze tests gebruiken echte tijdelijke PostgreSQL/PGlite-transacties en de volledige
Drizzle-migrationketen. Alleen externe Supabase Auth/Storage-requests zijn gemockt.
Ze bewijzen dus geen persoonlijke login/MFA of echte staging-uploads van begin tot eind.
De publieke bestaande tests blijven slagen en de publieke frontend/databinding is ongewijzigd.

Normale `npm run build` (`next build --webpack`): **FAIL in de lokale sandbox**, met
`ENOENT: no such file or directory, uv_resident_set_memory`.
Er is geen geheugenadapter gebruikt en geen buildinstelling veranderd.
De normale Vercel-build en runtime van deze nieuwe commit moeten door de eigenaar
worden bevestigd; de bevestiging van de vorige commit geldt niet als bewijs voor deze commit.

Serveruploads zijn maximaal **4 MiB** om binnen Vercels 4.5 MB-requestlimiet inclusief
multipart-framing te blijven. Bestaande buckets blijven 8 MiB en uitsluitend WebP.
Zie [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

## Goedgekeurde migration

Nieuwe Drizzle migration: `v2/drizzle/0003_secure_function_search_path.sql`.
Uitsluitend de twee goedgekeurde `ALTER FUNCTION ... SET search_path = ''` statements.
Hash: `2100595be61d9d563bd5c3b954c97a6988ed342c82f26f4d0bb3727c75a1f135`.
Drizzle timestamp: `1791407992182`.

Eenmalig toegepast via Supabase `apply_migration` als
`nsjl_v2_secure_function_search_path`, met de standaard Drizzle hash/timestamp-registratie
in dezelfde migration-uitvoering. De hashes/timestamps van de drie eerdere migrations
zijn vóór uitvoering exact vergeleken met Git; oude migrations zijn niet herhaald.
Drizzle-ledger bevat nu vier migrations. Beide functies hebben een lege search_path,
zijn SECURITY INVOKER en beide bestaande triggers zijn actief.

De twee search_path-WARN-meldingen zijn verdwenen. Alle 32 applicatietabellen hebben RLS;
`anon` en `authenticated` hebben nul directe tabelrechten. De bestaande 32 INFO-meldingen
[RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
blijven passen bij de server-only toegangsarchitectuur. Storage heeft geen directe client-writepolicies.
De Auth-FK is aanwezig en gevalideerd.

Na de migration: app-admins 0, source_reports 0, sync_runs 0, enabled source_configs 0.
Er is geen echt account aangemaakt en geen Bullshooter-bron opgehaald of geïmporteerd.

## Persoonlijke stappen — pas nadat de nieuwe staging-build werkt

Voer dit zelf uit binnen uitsluitend `nsjl-v2-staging`; deel geen geheime waarden in de chat.

1. Open [Supabase Auth](https://supabase.com/dashboard/project/qlmnqoeyhmljizxibyky/auth/users).
   Controleer onder **Authentication → URL Configuration** dat **Site URL** de bestaande
   canonical staging-URL uit `APP_URL` is en dat de toegestane redirect die URL met
   `/auth/callback` bevat. Laat publieke signup uitgeschakeld. Wijzig Vercel-variabelen niet voor deze stappen.
2. Laat de standaard **Invite user**- en **Reset password**-templates met
   `{{ .ConfirmationURL }}` staan. Custom SMTP of een aangepaste template is niet
   nodig voor deze Auth-flow. De app ondersteunt zowel standaard fragment-links
   als de bestaande `token_hash`-callback. De mailbeperkingen van het bestaande
   Supabase-mailplan blijven gelden; er wordt geen SMTP-configuratie gewijzigd.
3. Ga naar **Authentication → Users → Add user → Invite user** en nodig je eigen e-mailadres uit.
   Kies geen automatisch aangemaakt permanent wachtwoord. Open de ontvangen link nog niet.
4. Open de nieuw uitgenodigde gebruiker, kopieer diens **User UID** en open **SQL Editor**
   in ditzelfde project. Vervang uitsluitend de UID-placeholder hieronder en voer uit:

   ```sql
   INSERT INTO public.users (id, name, email, role, is_active)
   SELECT id, 'NSJL beheerder', lower(email), 'admin', true
   FROM auth.users
   WHERE id = 'VERVANG_DOOR_USER_UID'::uuid
   ON CONFLICT (id) DO NOTHING;
   ```

   Controleer dat precies jouw uitgenodigde account nu in `public.users` staat.
   Dit is accountregistratie, geen schemawijziging. Er zijn geen secrets nodig in deze SQL.
5. Zorg dat je in de stagingbrowser bent uitgelogd. Open de uitnodiging in je eigen
   browser. Een standaardlink vraagt eerst om bevestiging van het server-side
   gecontroleerde e-mailadres: ga alleen verder als dit jouw eigen account is.
   Stel je eigen unieke wachtwoord in en activeer je authenticator op `/admin/mfa`.
   Voer OTP's alleen op de stagingwebsite in. Bij bestaande (ook verlopen) cookies:
   gebruik **Uitloggen en maillink controleren**. De standaardmail is bij Supabase al
   verbruikt, dus de app houdt deze tokens alleen in geheugen om na expliciet uitloggen
   de huidige overdracht te vervolgen. Sluit/herlaad deze tab niet tijdens de overdracht;
   vraag bij verloren tokens een nieuwe herstelmail aan. Bij een aangepaste `token_hash`-
   link die vóór verificatie is geweigerd, kun je na uitloggen die oorspronkelijke link heropenen.
6. Test login, AAL1-redirect naar MFA, succesvolle verificatie, dashboard, nieuwe tab/sessievernieuwing,
   wachtwoordherstel met behoud van MFA, logout en weigering van beheer na logout.
7. Test een nieuwsconcept, bewerken, publiceren, intrekken/archiveren, profielbiografie,
   contact/hero-instelling en een kleine WebP. Controleer privé bekijken, publiceren,
   koppelen aan een profiel/bericht, weer intrekken en de bijbehorende auditregels.
   Gebruik herkenbare testcontent en archiveer/intrek die na controle.
8. Controleer dat beide sync-HTTP-ingangen 403 geven met `SYNC_ENABLED=false`.
   Laat de vlag en source_configs uit. Meld alleen PASS/FAIL en eventuele generieke fouten;
   deel geen QR-code, TOTP-sleutel, wachtwoord, cookies, mailtoken of signed media-URL.

Bij verlies van de authenticator is identiteitscontrole en MFA-reset door de projecteigenaar
nodig via **Authentication → Users → jouw gebruiker → MFA factors**. De applicatie heeft
geen automatische MFA-bypass of zelfbedachte recoverycodes.

Stop na deze acceptatietest. Fase E/import, scheduler en productiecutover vereisen nieuwe toestemming.

## Fix voor standaard Supabase-mails

Basiscommit van deze fix: `7cc27997f6e6108d4d3fa70d5cd69ffdf724e7d4`.
Er zijn geen nieuwe environment variables, migrations of service-instellingen nodig.

- `/auth/callback` behoudt de server-side `verifyOtp(token_hash)`-flow. Een standaard
  callback zonder querytoken gaat naar `/auth/voltooien`; browsers behouden hierbij
  het fragment. Redirects naar de ingestelde Site URL worden ook door de bridge opgevangen.
- De clientmodule verwijdert het fragment bij eerste uitvoering, vóór hydration of
  requests. Tokens blijven uitsluitend tijdelijk in geheugen, nooit in browseropslag.
  De bridge rendert zonder maillink niets en verandert de publieke vormgeving niet.
- Alleen HTTPS (of expliciete localhost-development) en same-origin POST zijn toegestaan.
  Een tijdelijke HttpOnly/Secure/SameSite=Strict CSRF-cookie en een aan de oorspronkelijke
  tokens gebonden bevestigingscookie beschermen de tweestapsoverdracht.
- De preview controleert de access-tokenidentiteit en het actieve adminregister en
  toont het echte e-mailadres. Alleen een expliciete bevestiging activeert de sessie.
  Een bestaande sessie wordt nooit stilzwijgend vervangen; eerst uitloggen is vereist.
  De expliciete logoutknop gebruikt de bestaande beveiligde logout-POST en controleert
  daarna dezelfde tijdelijk bewaarde mailtokens opnieuw; activering blijft een aparte klik.
- Activering verifieert het access-token bij de vast geconfigureerde Supabase-server,
  valideert het refresh-token en verifieert ook het vernieuwde access-token.
  Subject, issuer en session ID moeten overeenkomen; verlopen tokens worden geweigerd.
- Een atomische eenmalige sessieclaim en de audit worden in dezelfde DB-transactie
  geschreven, voordat cookies worden geplaatst. Dit gebruikt uitsluitend de bestaande
  server-only `rate_limits`-tabel, onder een eigen nooit resetbare `auth-mail-used`-namespace.
  Geen schemawijziging. Ook een geroteerd tokenpaar van een al geactiveerde sessie wordt
  geweigerd, onafhankelijk van Supabase's refresh-reusevenster.
- De URL-waarde `type` is alleen een UI-hint. Ze verleent geen rol en wordt niet als
  bewezen invite/recovery-actie geaudit. Alleen bevestigde actieve admins krijgen cookies.
  Sessiecookies blijven HttpOnly/Secure/SameSite=Lax. AAL2 en bestaande MFA-factoren
  blijven verplicht voor beheer en wachtwoordherstel.
- Gevoelige responses zijn private/no-store en no-referrer. De bestaande CSP blijft intact.
  Providerfouten, tokens, wachtwoorden en OTP's komen niet in responses, audit of logs.

Lokale tests gebruiken gemockte Auth-requests en echte tijdelijke PGlite-transacties.
Er is geen staging-account gemaakt, mail verstuurd of live Supabase-data gewijzigd.
Persoonlijke invite/recovery, browserfocus en MFA moeten na de nieuwe Vercel-build nog
door de eigenaar op staging worden geaccepteerd; de lokale tests bewijzen die E2E niet.

Controle van deze fix: **typecheck PASS, lint PASS, 333 tests in 19 bestanden PASS**.
Dat zijn 81 extra tests boven de basiscommit: server-mailhandoff 47, fragmentopvang 16,
clientflow 14 en vier aanvullende checks in de bestaande Auth-suite.
Secrets-check en scope-check PASS; publieke componenten/databinding, schema, migrations,
seed en serviceconfiguratie zijn ongewijzigd (alleen de inactieve Auth-bridge is aan de rootlayout toegevoegd).
Normale `npm run build` opnieuw **FAIL uitsluitend met `uv_resident_set_memory`** in
de lokale sandbox; geen geheugenadapter of aangepast buildcommando gebruikt.
De eigenaar moet de echte Vercel-build en runtime van de fix bevestigen vóór accountactivatie.
