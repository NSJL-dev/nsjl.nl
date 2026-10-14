# Bullshooter import integrity

Synchronization remains disabled. These changes do not authorize a live import.
The tests use checked-in HTML and fresh in-memory PostgreSQL/PGlite databases;
they never use the configured staging connection or a live Bullshooter provider.

## Source presence

| Source input | Parser representation | Import behavior |
| --- | --- | --- |
| Numeric value, including zero | Number | Import the provided value |
| Optional column not offered | No metric key | Initial SQL value remains NULL; reject if a known value would disappear |
| No row for a game | No game row | Do not assign NULL to that game's fields; reject if previously known |
| Explicit unknown average (`—`, `-`, `N/A`) with zero games | Explicit NULL | Initial average remains unknown; reject loss of a previously known average |
| Blank numeric cell, wrong cell count, merged cells, ambiguous headers | Source error | Reject the entire bundle |

No averages, missing counts, start times or zeros are invented. Only the audited
standings divider, schedule week headings and position-round rows are structural
exceptions. Both statistical sections remain required; an empty section is
rejected when the standings report played games.

## Transaction boundary

Fetch and parse occur outside the data transaction. Inside it, the importer locks
the owned `sync_locks` row with `FOR UPDATE`, checks the lease and reads the last
accepted source context. Previous teams, latest-result team identities, schedule
pairings and player/game/metric identities must still be represented. Player
comparison uses external identity and team/season/division context, not an
internal profile alone. A source-context change requires review.

Reports, teams, matches, standings, external players, statistics, histories and
the successful sync log commit together. An error, failed final log write or
expired lease rolls these writes back. The failed run is recorded separately;
lock cleanup is limited to the owning run. Cache invalidation happens after
commit and cannot retrospectively label committed data as rolled back.

The results table contains each team's latest result, not every historical
pairing. Previous historical result pairings need not appear in the next report.
Manual matches are excluded from the import match map.

## Verification and limits

Run `npm test -- tests/parser.test.ts tests/parser-integrity.test.ts
tests/sync.test.ts tests/sync-integrity.test.ts tests/sync-gating.test.ts
--maxWorkers=1 --hookTimeout=90000` (as one command).

Tests cover damaged rows/columns, absent players/teams/pairings, explicitly
unknown values, SQL failures late in the transaction, failed run completion,
expired/lost leases, repeated reports, simultaneous requests, scoped Tim
Goossens statistics and preservation of all prior data and histories.

PGlite uses one queued PostgreSQL connection. Concurrent request tests and SQL
row-lock assertions do **not** prove real multi-process PostgreSQL MVCC behavior.
Before a real sync is authorized, run a separate two-connection/process locking
test on an explicitly approved disposable PostgreSQL database. No test database
may be the existing staging database.

A first-ever report with valid-looking but missing individual rows cannot be
proven complete without a trusted baseline. Optional source fields never
previously supplied also have no completeness baseline. Likewise, consistently
wrong numeric source values cannot be identified from HTML alone. Source
membership/name changes and shrinking cumulative reports are deliberately
blocked for review; this patch neither reconstructs nor deletes existing data.
