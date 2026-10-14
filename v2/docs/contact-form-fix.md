# Contactformulier: Formspree/CSP-fix

De productieversie en V2 gebruiken hetzelfde publieke formulieradres:
`https://formspree.io/f/mdajbaba`, met velden `naam`, `email` en `bericht`.
Beide verzenden via JavaScript `fetch`, `FormData` en `Accept: application/json`.

## Bewezen oorzaak

De live stagingresponse bevatte `connect-src 'self' <Supabase-origin>` en
`form-action 'self' https://formspree.io`. `fetch` valt onder `connect-src`.
De browser blokkeerde daardoor de verzending voordat Formspree die kon ontvangen.
De originele website heeft deze beperkende CSP niet.

## Wijziging

- CSP staat uitsluitend het gevalideerde, exacte Formspree-formulierendpoint toe
  als extra connect-source. Geen wildcard, extra scriptbron of Auth-wijziging.
- Alle documentroutes gebruiken dezelfde bron, zodat App Router-navigatie naar
  home niet alsnog de oude CSP houdt. De bestaande native form-action blijft.
- Alleen HTTPS, `formspree.io` en `/f/<publiek-formulier-id>` zijn toegestaan.
  Credentials, querytokens, fragments en andere hosts worden niet doorgegeven.
- Dubbele klikken worden synchroon geblokkeerd; gegevens blijven staan bij fouten.
- HTTP 400/422, 401/403/404/410, 429, 5xx en netwerkfouten krijgen vaste Nederlandse
  meldingen. Een ontbrekende bevestiging wordt niet als bewezen niet-verzonden
  bericht omschreven. Alleen bevestigde 2xx-acceptatie leegt het formulier.
- Geen cookies, Auth-headers, responsebody's of exceptionteksten worden verstuurd
  naar Formspree respectievelijk weergegeven of gelogd.

Geen nieuwe Formspree-account, formulier of sleutel nodig. `FORM_SPREE_ENDPOINT`
blijft optioneel; de bestaande URL is de standaard en is geen geheim.
De bestaande providerinstellingen en productiecode zijn niet gewijzigd.

## Controles

Typecheck, lint en secrets-check: PASS. Volledige testsuite: 660 PASS in 30 bestanden,
waarvan 45 nieuwe contact/CSP-tests. Normale lokale build is geblokkeerd door de
bestaande sandboxfout `ENOENT uv_resident_set_memory`; er is geen adapter gebruikt.
Providerrequests zijn gemockt. Er is geen echte POST/contactmail verzonden.
Een OPTIONS-verzoek uit de uitvoeromgeving kreeg HTTP 403 via Cloudflare; dat
bewijst geen account- of POST-probleem en bevestigt ook geen mailboxontvangst.

## Persoonlijke stagingcontrole

1. Controleer in Vercel dat de nieuwe commit READY is en werkelijk op de vaste
   staging-URL draait. De eigenaar beheert de stagingconfiguratie zelf.
2. Open de homepage opnieuw (ook vanuit Nieuws via de navigatie) en verstuur één
   herkenbaar testbericht met je eigen e-mailadres. Controleer de succesmelding,
   een succesvolle POST naar het bestaande endpoint en ontvangst in de mailbox.
3. Kijk bij ontbrekende ontvangst ook in Formspree → Submissions/Spam. Een project
   met Restrict to Domain op `nsjl.nl` kan stagingberichten naar spam sturen.
   Wijzig die gedeelde productie-instelling niet zonder een apart besluit.
4. Test lege/ongeldige velden en tijdelijk offline versturen: er mag geen onterechte
   succesmelding verschijnen en de invoer moet blijven staan. Beoordeel alleen
   statuscodes bij terugrapportage; deel geen requestbody's of persoonsgegevens.

Staging deelt de bestaande Formspree-inbox en quota. Tests mogen geen loadtest zijn.
`main`, nsjl.nl, database, Auth, DNS en Bullshooter-synchronisatie zijn ongemoeid.
