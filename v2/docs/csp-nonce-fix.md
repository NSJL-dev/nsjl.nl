# Requestgebonden CSP-nonces

## Reparatie

De gedeelde `app/layout.tsx` gebruikt `dynamic = 'force-dynamic'`. De privacyroute
en de algemene App Router 404 worden daardoor op verzoek gerenderd, met dezelfde
nonce in de doorgegeven CSP-requestheader en de CSP-responseheader. Alle bestaande
HTML-pagina's gebruiken deze layout; toekomstige pagina's erven hetzelfde beleid.
Metadata-endpoints zoals `robots.txt` bevatten geen HTML of uitvoerbare scripts.

De CSP in `proxy.ts` is ongewijzigd. Er is geen uitzondering toegevoegd aan
`script-src`: productie behoudt de nonce en `strict-dynamic`. Auth, databinding,
Storage, synchronisatie en de publieke vormgeving zijn ongewijzigd.

## Regressiecontroles

- `tests/csp-nonce.test.ts`: dynamisch HTML-beleid, geen statische override in
  onderliggende routes, verse nonces, identieke request-/responsenonce, overschrijven
  van onbetrouwbare requestheaders, strikte scriptbeveiliging en behoud van
  Formspree/Supabase en private Auth-caching.
- `tests/e2e/csp-nonces.spec.ts`: echte browsercontrole van privacy en algemene
  404, twee afzonderlijke navigaties per route, alle uitvoerbare scriptnonces,
  cacheheaders en het mobiele menu openen/sluiten met toetsenbordfocus.

Voer de browsercontrole uit op de afzonderlijke, goedgekeurde preview-URL:

```sh
NSJL_CSP_TEST_URL=https://PREVIEW.vercel.app npx playwright test --config tests/e2e/csp.config.ts
```

Daarvoor is een geïnstalleerde Playwright Chromium nodig. De controle gebruikt
een nieuwe browsersessie en uitsluitend GET/navigatie; zij logt niet in en dient
geen formulieren in. Open een beschermde preview alleen via de gebruikelijke
geautoriseerde Vercel-toegang. Wijzig deploymentbescherming niet voor deze test.

Controleer daarnaast zelf `/privacy` en een onbekend pad op 420px: open het menu,
controleer de links en sluit het met Escape. Herhaal na herladen en controleer
dat de browser geen script-CSP-fout meldt. Promoveer pas na afzonderlijke goedkeuring.
