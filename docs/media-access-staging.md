# Gecontroleerde mediatoegang — NSJL V2 staging

Scope: branch `nsjl-v2`, uitsluitend `nsjl-v2-staging`. Geen Auth-, database-,
bucket-, policy- of Vercel-configuratiewijziging. `SYNC_ENABLED=false` blijft staan.

## Huidig toegangsmodel

| Route | Controle bij ieder verzoek | Response |
| --- | --- | --- |
| `/api/admin/media/[id]` | Supabase-sessie, bevestigde identiteit, actieve applicatiebeheerder, AAL2, preview-rate-limit en mediarecord | WebP-bytes; geen redirect of ondertekende URL |
| `/api/media/[id]` | Bestaand mediarecord, `status='published'`, gecontroleerd WebP-origineel in `private-media`; hercontrole na download | WebP-bytes; anders 404 zonder afbeelding |

Beide routes zijn dynamisch, gebruiken ongecachete serverophaling en geven
`Cache-Control: private, no-store`, `CDN-Cache-Control: no-store` en
`Vercel-CDN-Cache-Control: no-store`, ook bij fouten. Geen ETag, Last-Modified,
304, Storage-Location of bearer-link. Vercel kan zijn eigen CDN-header verwerken
en uit de zichtbare response verwijderen; de browser moet `private, no-store`
ontvangen. `Cross-Origin-Resource-Policy: same-origin` beperkt extern embedden.

De server haalt het bestand met zijn server-only Storage-client op uit
`private-media`, met een nieuwe cacheNonce en `cache: 'no-store'`. Bucket,
MIME-type, grootte en WebP-signatuur worden gecontroleerd. Nieuwe uploads
krijgen `cacheControl: '0'`; bestaande objectmetadata wordt niet gewijzigd.
Publicatie valideert bovendien het eerder geüploade WebP-origineel.

Publiceren/intrekken wijzigt alleen `media.status`, `alt_text`, `updated_at` en
de bestaande auditregistratie, binnen één DB-transactie. ID, opslagpad,
bucket, originele bytes en koppelingen uit nieuws/spelers blijven behouden.
Er worden geen openbare Storage-kopieën meer aangemaakt, verplaatst of verwijderd.
De bestaande cleanup van een nieuwe upload waarvan de DB-write mislukt blijft
behouden; die cleanup betreft uitsluitend die nieuwe, mislukte upload.

Alle dynamische publieke afbeeldingen gebruiken de gecontroleerde URL op media-ID
met `Image unoptimized`. Next.js Image Optimization accepteert alleen statische
`/img/**`-assets zonder querystring. Handmatig geconstrueerde optimizerrequests
voor beide mediaroutes en oude externe Storage-bronnen worden vóór cache-ophaling
geweigerd. Het originele NSJL-logo blijft optimaliseerbaar. Vormgeving, afmetingen,
alt-teksten en publieke pagina-opbouw blijven behouden.

## Inventarisatie van bestaande opslag en links

Alleen-lezen stagingcontrole op 8 oktober 2026:

- 1 applicatiemediarecord, status `private`; het privé-origineel bestaat.
- 0 openbare Storage-kopieën met hetzelfde pad als een applicatiemediarecord.
- 2 objecten in `private-media`, 1 in `published-media`.
- Het openbare object heeft geen overeenkomstig applicatiemediarecord en wordt
  niet door de nieuwe route geleverd. Het blijft ongemoeid.
- Beide bestaande buckets blijven 8 MiB/WebP; alleen `published-media` is public.
- Het aanwezige applicatie-origineel heeft nog `max-age=3600`-metadata.
- 0 rechtstreekse Storage-URLs in nieuws, profielteksten, site-instellingen of
  sponsorvelden; 0 media-FK's vanuit die vier categorieën in deze momentopname.
- 0 ingeschakelde bronconfiguraties en 0 sync runs.

Dit is een momentopname van objectmetadata, geen HTTP-bewijs dat eerder uitgegeven
URLs overal onbereikbaar zijn. Er zijn geen bestaande links, tokens of objectnamen
in dit document opgenomen en geen Storage-objecten gewijzigd.

Historische links blijven een afzonderlijk risico:

1. Oude ondertekende privélinks staan niet in de database. De nieuwe code geeft
   ze niet meer uit. Bestaande bearer-links zijn niet gekoppeld aan de adminsessie;
   hun geldigheidsduur en eventuele eerder gecachte responses moeten afzonderlijk
   worden beoordeeld. Logout trekt zulke oude links niet zelfstandig in.
2. Rechtstreekse URLs naar `published-media` omzeilen de nieuwe applicatieroute.
   Een nog aanwezige kopie blijft zelfstandig openbaar, ongeacht `media.status`.
3. Eerder gecachte browser-, Storage-CDN- of optimizerresponses worden niet
   gewist door nieuwe responseheaders. Oude optimizerbronnen worden nu geweigerd,
   maar al opgeslagen bytes en oude deployment-URLs verdwijnen daarmee niet.
4. Reeds gedownloade bestanden, screenshots en responses die al verstuurd zijn,
   kunnen niet worden teruggehaald. De tweede publicatiecontrole blokkeert een
   intrekking tijdens Storage-ophaling; zij trekt geen al geleverde bytes in.

## Veilig migratie- en intrekkingsplan — afzonderlijke goedkeuring nodig

1. Laat eerst de eigenaar de nieuwe stagingcommit/build en hieronder beschreven
   controles bevestigen. Bestaande media-ID's en FK-koppelingen hoeven niet te
   worden gemigreerd; de frontend maakt zelf gecontroleerde URLs.
2. Inventariseer daarna opnieuw alleen-lezen de oude openbare kopieën, hun
   mediarelaties en eventuele directe URLs in content. Deel uitsluitend aantallen,
   routecategorieën, statuscodes en cachemetadata; geen privélinks of tokens.
3. Vraag afzonderlijke toestemming voor een exact afgebakende lijst oude
   applicatiekopieën. Verwijder uitsluitend goedgekeurde openbare kopieën via de
   Storage-API, nooit de privé-originelen of het niet-gekoppelde testobject.
   Geen rechtstreekse DELETE op `storage.objects`.
4. Controleer na zo'n goedgekeurde opruiming zowel de oorspronkelijke openbare
   URL als een variant met een nieuwe querywaarde, zonder login. Vergelijk HTTP-
   status, Content-Type en beschikbare Age/Cache-Control/CF-Cache-Status-headers,
   met browsercache uitgeschakeld én in een nieuw privévenster. Een queryvariant
   vervangt geen controle van de exacte oude URL.
5. Voor oude ondertekende links kan de eigenaar lokaal, zonder de URL te delen,
   dezelfde metadatacontrole uitvoeren na de eerdere token- en cachetermijnen.
   Wijzig geen credentials of privé-objecten om dit te forceren. Meld blijvende
   bereikbaarheid afzonderlijk; neem geen onmiddellijke wereldwijde intrekking aan.
6. Geen betaalde CDN-purge, upgrade, bucketprivacywijziging of objectverwijdering
   is onderdeel van deze codewijziging. Bij noodzakelijke extra maatregelen eerst
   een concreet voorstel en aparte toestemming.

## Persoonlijke stagingacceptatietest

Gebruik uitsluitend een onschuldige nieuwe testafbeelding. Deel geen cookies,
ondertekende URLs, tokens of responsebodies in de chat.

1. Controleer dat Vercel de nieuwe branchcommit met het normale buildcommando
   heeft gebouwd. Controleer homepage, team, nieuws en nieuwsdetail: dezelfde stijl
   en logo, bestaande ontbrekende-foto-toestanden behouden.
2. Log als actieve admin in en voltooi MFA. Upload privé, klik in `/admin/media`
   op bekijken: GET `/api/admin/media/[id]` geeft 200 en `image/webp`, zonder
   redirect/Location naar Supabase. Network toont uitsluitend de NSJL-route.
3. Open precies die previewroute in een volledig nieuw privévenster zonder login:
   401/403, geen afbeeldingsbytes. Test ook na logout en met een sessie zonder
   voltooide MFA: geweigerd. Een al open afbeelding kan eerder ontvangen bytes
   blijven tonen; controleer een nieuw netwerkverzoek.
4. Open `/api/media/[id]` zonder login terwijl de status privé is: 404. Publiceer
   via beheer en laad precies dezelfde URL: 200/WebP. Controleer geen gedeelde
   cache-HIT en `Cache-Control: private, no-store` bij herhaalde netwerkrequests.
5. Zet terug naar Privé, sla succesvol op en herlaad dezelfde publieke URL zonder
   login: 404 en geen afbeeldingsbytes. Herhaal met browsercache uitgeschakeld,
   in een nieuw privévenster, met nieuwe querywaarde en na een eerdere 200.
   Herhaal publiceren → archiveren. Ook foutresponses moeten `no-store` dragen.
6. Controleer dat publieke foto-requests niet via `/_next/image` lopen. Handmatig
   verzoek aan `/_next/image?url=<URL-encoded mediaroute>&w=640&q=75` moet 400
   geven voor beide gecontroleerde routes. Het statische blauwe logo blijft werken.
7. Controleer in beheer dat het oorspronkelijke bestand en dezelfde media-ID
   behouden zijn. Een bestaande nieuws-/profielkoppeling blijft opgeslagen;
   na intrekking krijgt de publieke pagina zijn bestaande ontbrekende-foto-state.
8. Beoordeel historische Storage-links apart volgens het migratieplan. Een
   geslaagde gecontroleerde-route-test bewijst geen intrekking van oude directe
   URLs. Rapporteer alleen route, methode, status en veilige cachemetadata.

Lokale regressies gebruiken echte tijdelijke PostgreSQL/PGlite-transacties en
gemockte Auth-/Storage-verzoeken. Zij bewijzen geen persoonlijke MFA-sessie,
echte Supabase-download of daadwerkelijke Vercel-CDN-afhandeling. Die controles
blijven onderdeel van deze persoonlijke stagingacceptatie.

## Lokale kwaliteitscontrole

Typecheck PASS; lint PASS; volledige suite PASS: 397 tests in 21 bestanden.
Daarbinnen 99 gerichte tests in de vijf media-/beheer-/publieke databindingbestanden.
De 8 optimizerregressies zijn opnieuw uitgevoerd na de typecorrectie in hun fixture.
De normale `npm run build` (`next build --webpack`) stopt lokaal met
`ENOENT: no such file or directory, uv_resident_set_memory`. Geen adapter,
dependencywijziging of buildworkaround toegepast. Een geslaagde nieuwe Vercel-build
en de persoonlijke route-/cachecontroles blijven nodig vóór stagingacceptatie.

## Gewijzigde bestanden

- `v2/app/api/admin/media/[id]/route.ts`
- `v2/app/api/media/[id]/route.ts` (nieuw)
- `v2/lib/media-response.ts` (nieuw)
- `v2/lib/media.ts`
- `v2/lib/admin/mutations.ts`
- `v2/lib/public-data.ts`
- `v2/next.config.ts`
- `v2/app/admin/(protected)/[section]/page.tsx`
- `v2/app/(public)/nieuws/[slug]/page.tsx`
- `v2/components/public/players.tsx`
- `v2/components/public/news.tsx`
- `v2/components/public-data-ui.tsx`
- `v2/components/data-ui.tsx`
- `v2/tests/media-access.test.ts` (nieuw)
- `v2/tests/media-optimizer.test.ts` (nieuw)
- `v2/tests/media-workflows.test.ts`
- `v2/tests/admin-http.test.ts`
- `v2/tests/public-binding.test.ts`
- `docs/media-access-staging.md` (nieuw)
- `docs/phase-d-staging.md`
