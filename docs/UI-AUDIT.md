# UI Audit — Code vs Stitch Design

**Date:** 2026-09-30
**Design source:** Stitch project `16572086065168022609` — "Klub Sukaria Gaming Booking", design system `assets/0a53ea4032e44043bfd2aeda6c1e3b77` ("Klub Sukaria Arcade & Lounge")
**Code:** Next.js 15.5.26 / React 19 / Tailwind v4, dev server on `:3000`
**Status updated:** 2026-09-30, after sprints 1–6

> **Read this section first.** The body of this document is the *original* audit, kept as
> the record of what was wrong at the time. Sprints 1–6 have since shipped, so several
> findings below are fixed and a few claims in it turned out to be wrong. Use the tables
> in this section to decide what is still open — the original prose is left unedited
> except where a claim was factually wrong, and each stale section carries a `Since:`
> line.

## Status — 2026-09-30, after sprints 1–6

Shipped: 8 migrations (`0009`–`0016`), a shared media pipeline, 81 generated placeholder
images, 94 regression tests, an authenticated admin-route harness, and all five sections
of `/admin/reports` with CSV export. `npm run typecheck` clean, `npm run lint` clean,
`npm test` 121/121 (serial, see below), `npm run build` compiles.

### Root causes

| # | Status | Resolution |
|---|---|---|
| R1 | **Fixed** | Removed the shadcn `@theme inline` block that shadowed the Stitch tokens. `rounded-xl` = 24px, `lg` = 16px, `md` = 12px; brand muted gray and warm-paper off-white now resolve as specified. The two colliding token names were renamed `controller-gray` / `warm-paper`. |
| R2 | **Fixed** | `0016_media_bucket_and_columns.sql` adds `image_url` to `games`/`snacks`/`units`/`branches`, creates the public `media` bucket (5 MB cap) and 4 storage RLS policies. `<Cover>` renders `<img>` when a URL exists and keeps the brand gradient as a real fallback. `scripts/generate-media.mjs` generates and links 58 game covers + 23 unit images. `.shadow-arcade` went from 0 → 9 call sites. |
| R3 | **Fixed** | All 17 native `<select>` elements across 8 files now render through `SelectField` (`src/components/ui/select-field.tsx`), which is still the *platform* control — 48px, design tokens, a redrawn chevron via the `.select-field` utility. `size="sm"` gives dense table cells 32px, matching the inputs beside them. The 191-line Radix wrapper in `ui/select.tsx` was dead (0 importers) and did not compile — it imported `cn` from a bare `"cn"` specifier — so it is deleted rather than repaired. **Why native and not Radix:** a native select already ships typeahead, screen-reader announcement and the mobile wheel picker; a custom listbox re-implements all three and is worse on touch. Verified 0 bare `<select>` remain in the rendered HTML of every public route. |
| R4 | **Open** | Unchanged. No step strip in `src/app/(customer)/layout.tsx`; `Ticker` is still imported only by the home page. Funnel position remains invisible on `/tiket` and `/payment`. |

### Confirmed defects

| # | Status | Resolution |
|---|---|---|
| D1 | **Fixed** | `0009_fix_booking_encoding.sql` corrects the literal in `create_booking()` and repairs the 3 affected RENTAL rows. |
| D2 | **Fixed** | Route added: `src/app/(customer)/cabang/[branch_id]/page.tsx`. |
| D3 | **Fixed** | Now `Kosong pukul <time>` plus a live `CountdownBadge`. `Countdown`/`CountdownBadge` also had a hydration mismatch, fixed by deferring the first tick to an effect. |
| D4 | **Fixed** | Replaced with a description derived from real catalogue data. |
| D5 | **Fixed (3 of 4 fields)** | `0017_game_metadata.sql` fills `developer` **58/58**, `publisher` **57/58**, `release_date` **58/58**, harvested from Wikidata and verified per game to resolve to an actual video game (`P31 -> Q7889`) rather than a film or series. Provenance and every Q-id are in `docs/game-metadata.json`; the harvest/override logic is `scripts/gen-game-metadata.mjs`. The related-games block was already fixed earlier via a genre-then-platform fallback. **`age_rating` is deliberately still 0/58** — see below. The genre filter is no longer dead: see `0018`. |
| D6 | **Open** | `src/app/(customer)/booking/page.tsx:10` still types only `{ unit, branch }`. `?type=` and `?slot=` are still silently dropped. |
| D7 | **Fixed** | `unit-actions.tsx` has an `AVAILABLE` action alongside Maintenance/Offline. |
| D8 | **Fixed — the real defect was worse than "not implemented"** | The page said it could "ganti role, atau nonaktifkan" and both controls existed, so the audit note ("only create is implemented") was stale. Role change did work. **But `Nonaktif` called `auth.admin.deleteUser()`** — it destroyed the auth identity rather than deactivating the account, taking the email and the link to that person's audit history with it, and wrapped in `.catch(() => null)` so a failure reported as success. There was also no way back: the UI only ever sent `active: false`. Now a ban (`ban_duration: "876000h"`) blocks sign-in while keeping the row, `ban_duration: "none"` reverses it, the error is no longer swallowed, and the row shows `Aktifkan` when inactive. Verified end-to-end: deactivate → `NONAKTIF` with the email still present, reactivate → `STAFF` again, and privilege escalation to `OWNER` is still refused. |
| D9 | **Partly fixed** | `fmtDate` is now used. `/api/availability` and `/api/admin/booking-config` still have **zero** callers. |
| D10 | **No longer present** | No `VIPV` unit exists in the database. Seed-data quality, not a UI defect. |

### What shipped

| Sprint | Migration | Change |
|---|---|---|
| 1 | `0009_fix_booking_encoding.sql` | D1: repair the RENTAL description literal + 3 rows |
| 1 | `0010_inventory_stock_movements.sql` | Snack `SALE` movement on booking |
| 1 | `0011_fix_double_stock_return.sql` | Guard against double-returning stock on a rewritten terminal status |
| 1 | `0012_release_unit_on_booking_end.sql` | `handle_booking_ended()` releases the unit + stock; repaired 23 stranded units |
| 3 | `0013_booking_config_per_branch.sql` | Per-branch booking config (Batu 5, Ganet) |
| 3 | `0014_slot_availability.sql` | `slot_availability()` RPC → `GET /api/slots` |
| 4 | `0015_fix_vote_count_sync.sql` | `sync_game_request_votes()` made `SECURITY DEFINER` |
| 5 | `0016_media_bucket_and_columns.sql` | R2: `media` bucket, storage RLS, `image_url` ×4 tables |
| — | `0017_game_metadata.sql` | D5: `developer` 58/58, `publisher` 57/58, `release_date` 58/58 from Wikidata |
| — | `0018_game_features.sql` | `genre` 58/58 + mode flags; re-enables the genre filter |
| — | none (app-only) | Stock ledger: a manual `/admin/snacks` edit now writes an `ADJUSTMENT` movement instead of setting `snacks.stock` directly |
| — | none (app-only) | `/admin/bookings` real table + CSV export, and the search box — which had never worked, returning 500 for every term |
| — | none (app-only) | `/admin/units` card grid → master-data table keyed on unit code, with search, filters and sortable headers |

Sprint 2 was `globals.css` only (R1). Sprints 4–6 also added `/units/[unit_id]`,
`/admin/audit-log`, `/admin/customers`, the game-request + vote panel, the 5-channel
payment picker, and the media upload UI for games, snacks and units. A later pass added
the `/tiket` QR block, copy-code button, WhatsApp share and the previously-unrendered
branch address — the one new dependency in the project is `qrcode` (plus its types),
because Reed-Solomon error correction is not something to hand-roll. **No PIN was added:
the booking code is already the pickup code, and a second secret is a second thing to
explain at the counter.**

### Deactivating staff was a delete

`PATCH /api/admin/users/[id]` set `profiles.active = false` and then, for
`active === false`, called `auth.admin.deleteUser(id).catch(() => null)`.

Three things wrong with that, in increasing order of severity:

1. **It deleted instead of deactivated.** The `profiles.active` flag the whole UI keys
   off was pointless — there was no auth user left to deactivate. The email was gone,
   and so was any way to tie that person to audit rows they had authored.
2. **It was irreversible.** Nothing in the app ever sent `active: true`, so `Nonaktif`
   was a one-way button on a real account.
3. **It reported success when it failed.** `.catch(() => null)` means a rejected
   `deleteUser` produced the same "ok" as a successful one.

The fix is a ban rather than a delete: `auth.admin.updateUserById(id, { ban_duration:
"876000h" })` refuses new sign-ins and keeps the row, and `{ ban_duration: "none" }`
lifts it. `getStaffUser()` already rejected `active = false` profiles, so the app-level
lockout was correct and never depended on the auth row existing — updating the profile
first means a failed ban still fails safe (locked out of the app, unused auth row
survives). The error is now surfaced instead of discarded, and the error messages say
which half failed, because a half-applied deactivation is otherwise invisible.

Verified against a throwaway staff account: `STAFF` → deactivate → `NONAKTIF` with the
email still readable (proof the auth row survived) → reactivate → `STAFF`. Promoting to
`OWNER` is still refused by the schema, and self-modification and OWNER modification are
still refused by the route. The test account and its audit rows were deleted afterwards.

**No automated test — resolved.** This is the bug that motivated the route harness below.

### Admin Reports & Analytics — what the design asks for vs what the data can answer

The design is `Admin - Reports & Analytics` (`c07840e4de7b484fa00b0c2db18d34b6`), five
sections. Checked every card against the schema before building:

| Design card | Verdict |
|---|---|
| 8 booking KPIs, daily trend, status ring, 10-column transaction table | **Built** — Section 1 |
| Gross revenue, rental vs snack split, refunds, payment channels, payment-status reconciliation, financial journal | **Built** — Section 2 |
| Available/used/booked hours, 24-hour heatmap, per-booth utilisation | **Built** — Section 3 |
| Unique/new/returning guests, ARPU, top-guest table | **Built** — Section 5 |
| Game request pipeline | Computable — **Section 4 not built yet** |
| **"Diskon & Voucher −Rp 2.320.000, Midnight Pass promo"** | **Not computable.** `promotions` is a price-override table (`promotion_items` maps facility+duration to a price); there is no discount ledger and no column anywhere recording a discount applied to a booking. |
| **"Setor dana tunai kasir shift malam ke brankas SPV"** | **Not computable.** No shift, cashier or deposit table exists. |
| **"Most Played Games — 184 sesi, 420 jam main"** | **Not computable.** `booking_items.item_type` is only `{RENTAL, SNACK}` — the app never records which game a booking played. Building this needs the booking funnel to capture a game choice, which is a product change, not a UI change. |
| **"VIP Tier Active — MIDNIGHT VIP / REGULER LOYAL"** | **Not computable.** No membership table. |
| **"Download PDF Audit Kasir", "Rekap Log Shift"** | **Skipped.** No shift data, and PDF would need a new dependency. CSV is already covered by the `/admin/bookings` pattern. |

**Status: Sections 1, 2, 3 and 5 ship.** Only Section 4 (the game-request pipeline) remains,
and it is small — see the table above for the scope of what is deliberately absent.

A card that reports a fabricated number is worse than a missing card, so the four
uncomputable ones are absent rather than zeroed.

Two deliberate departures from the design, both because the design is a mockup with no
data behind it:

- **`Menunggu Bayar` is in the status ring** even though the design omits it. With the
  design's six slices the ring accounted for 5 of 6 bookings, so every percentage was a
  share of a total the reader could not see. A pinned test asserts the ring now sums to
  the total.
- **"Durasi Paket" shows duration, not a package name.** `booking_items.description` for
  a rental row is `"Capsule 02 — 60 menit"`, so the package identity ("Midnight Mabar",
  "Party Pass") is not stored and is not invented.

Date handling is where this would have gone quietly wrong, and it is pinned by tests: a
booking belongs to the day it *starts* in **WIB**, so `16:30Z` is the 20th and `17:30Z` is
already the 21st. Booking by UTC day shifts the whole trend and the peak hour by a day.
The branch filter is a plain `eq` on `bookings.branch_id` — the column is denormalised onto
the booking, so it needs neither an `!inner` embed nor an `.or()`, both of which are the
bookings-search bug in different clothes.

A layout bug worth recording because a screenshot caught it and a typecheck never would:
the trend bars are `<div>`s with `height: X%`. Inside an auto-height flex column a
percentage height resolves to **0**, so the first version rendered an empty chart with two
floating count labels. The column needs `h-full`, and the bar needs a `max-w` or two data
points stretch to 380px each.

### The revenue rule that matters: PENDING is not money

Every payment in the database right now is `PENDING`, so `/admin/reports` shows a gross of
**Rp 0** while `Status pembayaran` shows **Rp 272.000** of unpaid invoices. That is the
behaviour worth defending, not a bug to paper over:

- **Gross counts only `PAID`, `REFUNDED`, `PARTIALLY_REFUNDED`.** A pending or failed
  payment is an invoice. Counting it turns "net realized" into a promise.
- **The rental/snack split is filtered to collected bookings too.** Otherwise the shares
  beside a gross figure would not add up to it — the two would be counting different
  populations, which is the classic way a revenue report stops adding up.
- **The journal column is "Tagihan", not the design's "Net diterima".** The value is
  `gross_amount`; for a pending row that is a charge, not cash in the till. Uncollected
  rows are dimmed so the two are not confused at a glance.
- **Diskon has no line at all**, with the reason printed under Net realized. A `Rp 0`
  discount row would read as "nobody used a discount" rather than "discounts are not
  recorded", and those are very different facts to a manager.

A booking can carry more than one payment — an extension creates its own — so the status
buckets are counted per payment, not per booking.

### Occupancy: deriving duration from a history table with no end column

`unit_status_history` records `unit_id, from_status, to_status, created_at` and **no
`ended_at`**. The only way to know how long a unit sat in `IN_ORDER` or `MAINTENANCE` is
to pair consecutive rows per unit: a row's status runs from its own `created_at` until the
next row for that unit, and the last row runs to the end of the report window.

Two things make that trustworthy rather than approximately right:

- **Intervals are clipped to the report window.** Without the clip, a transition recorded
  last month would contribute its whole (open-ended) duration to a report for the last 30
  days — and the final row of every unit has no successor, so without a bound it would
  run to infinity.
- **Only `CHECKED_IN`, `IN_USE` and `COMPLETED` count as used.** A cancelled or expired
  booking never happened, and counting it would inflate occupancy on exactly the bookings
  where the guest walked away.

"Available hours" is the design's own definition — units × 24 × days — which for 23 units
over 30 days is 16.560 hours. Occupancy therefore reads **0.0%** here against 2 used
hours, which is arithmetically correct and looks odd next to "Dipakai 2 jam"; it is not
rounded away to hide the denominator.

`unit_status_history` only has 18 rows and begins on 2026-09-27, so sanitasi and
maintenance both legitimately read 0 for this window. They are computed from real
intervals, not defaulted to zero — a fleet with maintenance hours would show them.

### Retention: "new guest" cannot be read off the window

A guest is new when their **first-ever** booking falls inside the report window. Reading
that off the windowed rows alone would label every customer new every time their first
booking aged out of the period — a retention figure that could only ever trend towards
100% new. So the guest section issues one extra, deliberately *unfiltered* query over the
same customers, takes the earliest `scheduled_start_at` per customer, and compares it to
the window start.

Two tests pin this, and the second one only became meaningful once a customer had two
bookings:

- A window covering a guest's whole history reports them as new, `returningGuests === 0`.
- Narrowing the window to just after their first visit flips them to returning.

Both ran against real data (`CUS-000018`, visits on the 28th and 30th); with a single
booking per customer the second test would have silently returned early, so it was
confirmed against the verbose reporter rather than trusted because it was green.

Three more labelling decisions worth recording:

- **ARPU is divided by unique guests, not by bookings**, and is labelled "Nilai sesi"
  rather than the design's "Net Spending". It is invoiced value; since every payment here
  is `PENDING`, computed-cash ARPU would read Rp 0 and be useless next to a real figure.
  The footnote says so.
- **Average duration covers sessions that ran**, not cancellations — the same rule as
  occupancy, for the same reason.
- **"Tipe Member" is omitted.** `MIDNIGHT VIP` and `REGULER LOYAL` in the design imply a
  membership table; there is none. A `baru` badge marks genuinely new guests, which is
  real information, where a fabricated tier would not be.

### The five QA states, and a leak the fix exposed

The design's QA simulator lists Normal / Skeleton / Empty / Error / No Permission. All
five are reachable now:

| State | How |
|---|---|
| Normal | the page itself |
| Empty | `EmptyState` when the window has no bookings |
| Skeleton | `src/app/admin/reports/loading.tsx`, shaped like the loaded layout so nothing jumps |
| Error | `src/app/admin/reports/error.tsx` — replaces the whole page, because a half-rendered report passes a wrong total off as real |
| No Permission | `getStaffUser(["OWNER","ADMIN"])` with a plain refusal |

The permission gate was a genuine gap, not just a missing state: the admin layout only
asks "is this an active staff profile", so **any STAFF could read revenue**. The export
route repeats the check — otherwise the CSV is simply a way around the gate.

**Adding the second CSV test caused a leak, and it was mine.** Both injection tests
assigned to a single `bookingId`, so the second overwrote the first and `afterAll` only
ever removed one of them. Each run leaked a booking, its customer, and — through the unit
FK — the test unit itself, which is why `units` had drifted from 23 to 30. The symptom
appeared far from the cause: a unit deletion failing on a foreign key looked like a units
problem, not a cleanup problem. Cleanup now collects every booking id and phone it created.
Purged the 7 units, 7 bookings and 14 customers, and confirmed stable across three runs.

The export link sends the **resolved** range, not the raw filters. A preset like "7 Hari
Terakhir" resolves on the server, so passing the preset through would have shown 7 days on
screen while the file silently covered the export's own 30-day default — the same
table-and-export drift the shared query builder exists to prevent.

### The connection-limit flake, fixed rather than documented

Three times a suite failed to load with `Connection terminated unexpectedly` plus a hook
timeout — always in whichever file lost the race, never reproducible in isolation. Each of
the nine specs is an integration test holding a `pg` connection for the life of the file
while its PostgREST calls also occupy a backend connection, and the project database
allows 60 with idle connections accumulating. It was written up as a known flake twice;
that was wrong, because the cause is configuration, not luck. `fileParallelism: false` in
`vitest.config.ts` trades wall-clock for determinism — 93/93 on four consecutive runs.

### The admin route harness

`tests/admin-harness.ts` signs in as the bootstrapped owner against the real auth server
and calls exported route handlers directly. The session is genuine, `getStaffUser()`
verifies it over the network, and the profile read goes through RLS. The only thing faked
is Next's request scope: `tests/setup.ts` mocks `next/headers` with an in-memory cookie
jar, because `cookies()` throws outside a request and that was the whole blocker. The
session cookie is written by `@supabase/ssr` during sign-in, so its encoding is never
hand-rolled.

Mocking the framework boundary rather than app code is the point — mocking
`@/lib/supabase/server` would have tested the mock.

Three route specs use it, covering every admin defect found in this audit:
`admin-users-route.spec.ts` (9), `admin-routes-regression.spec.ts` (6) and the earlier
query builders. Each was checked by reintroducing its bug and confirming the test goes
red, because a test that passes on broken code is decoration:

| Reintroduced bug | Test result |
|---|---|
| `deleteUser` on deactivate | 2 fail — ban absent, reactivate 404s |
| CSV formula guard removed | 1 fails, raw `=cmd\|…` in the file |

Four things this harness cost, all found by running the suite repeatedly rather than once:

- **A test that mutated a real catalogue row.** The stock regression test reused `SNK-001`
  and "undid" it by inserting a movement of `+stock`, which compounded: **SNK-001 reached
  stock 1022 with ~750 junk ledger rows.** Restored through the ledger, then the junk
  purged. Every test now owns its rows (`B-SNK-RT*`, `B-U-RT*`) and deletes them.
- **Borrowing a shared unit.** The CSV test took "the first AVAILABLE unit at BR-B5" —
  the same query `bookings-query.spec.ts` uses — so a foreign booking FK-referenced its
  own fixture and cleanup failed. It now creates a non-`AVAILABLE` unit at BR-GANET,
  which no other suite can select.
- **Audit rows leaked.** `adminCrud` writes one per write; the tests left 46 rows about a
  snack that no longer existed. Now deleted by `entity_id`.
- **Two wrong assertions of mine.** One compared two fleet lengths (other suites add and
  drop rows mid-run). The other asserted `desc` was a pure reverse of `asc` — it is not,
  because `listUnits` always tiebreaks on `unit_id` *ascending*, so tied names keep their
  order in both directions. The stable tiebreak is deliberate and is now pinned.

One test was dropped on purpose: the route's `target.role === "OWNER"` guard. There is
exactly one owner and it is always the actor, so the self-guard fires first and the branch
is unreachable. Exercising it would mean creating a second real auth user, promoting it
to OWNER, and leaving a live privileged account with a known password behind if the run
crashed. Defence in depth is not worth that risk.

### Why the admin query builders live outside `catalog.ts`

`listUnits()` started in `src/lib/catalog.ts` and its tests failed with
`` `cookies` was called outside a request scope ``. That module reads through the
cookie-scoped client on purpose — it serves the public catalogue, and RLS allows anon
SELECT — but `cookies()` cannot run in a node test, so nothing in the query layer was
reachable. It moved to `src/lib/units-query.ts` using `createAdminClient`, matching
`bookings-query.ts`. The rule that came out of it: **an admin query builder belongs in
its own module with the service client, or it is untestable.**

Two details worth keeping:

- `sort` is interpolated into `.order()`, so it is whitelisted. An unrecognised value
  falls back to `unit_id`; it does not reach PostgREST.
- `.order(column).order("unit_id")` is not redundant — there are two `Capsule 01`
  units, so the second key is what keeps same-name rows in a stable order.
- The filter form carries `sort` and `dir` as hidden inputs. A GET form only submits
  named inputs, so without them a sort chosen by clicking a header was silently dropped
  the next time anyone pressed Filter.

`npm run build` is worth more than `tsc` for this page too: defining a component
(`SortHeader`) inside a server component body is a runtime error that typecheck passes.

### The `/admin/bookings` search box had never worked

Found only because the CSV export was made to honour the same filters — clicking
`Export` on a filtered table and getting an HTTP 500 is a much louder signal than a
search box quietly returning nothing. The old filter was:

```ts
query.or(`booking_code.ilike.${term},customers.name.ilike.${term},customers.phone.ilike.${term}`);
```

Three separate faults, all of them 500s for **every** search term:

1. **PostgREST cannot filter on an embedded table.** `customers.name` is a to-one
   embed behind a foreign key. Referencing an embedded column inside `.or()` is a
   logic-tree parse error, not a filter that matches nothing.
2. **`.or()` takes its predicates unwrapped.** supabase-js adds the parentheses, so
   adding them by hand produces `(((` and fails the same way.
3. **The `q` value was never escaped.** `%` and `_` are ILIKE wildcards and `,` `(` `)`
   are filter syntax, so a search box was an injection point into the filter string.

The fix resolves matching `customers` first and turns the embedded columns into
`customer_id.in.(...)` on `bookings`, which PostgREST does support, with the search term
sanitised. A detail worth recording: the first version returned `[]` when no customer
matched, which silently broke **every booking-code search** — an `SR-XXXXXX` code never
appears in a customer's name or phone, so the code predicate has to survive on its own.

Verified: `Slot` (name), `081200000003` (phone), `SR-FYJEJM` and `FYJEJM` (exact and
partial code), `nosuchterm` (empty), and `q` composed with `status`.

**Now covered.** `tests/bookings-query.spec.ts` (12 tests) calls `listBookings()` directly
against the real PostgREST — no HTTP or auth harness needed, because the function is a
plain export and `createAdminClient()` carries no `server-only` guard. It pins the
exact/partial code, phone, hostile-name, metacharacter, status-combination and
column-shape cases. Reintroducing the embedded-column filter turns 8 of them red with
the original `failed to parse logic tree` error, so the test is known to catch the
original bug rather than just passing.

One test was written wrong on the first pass and caught by running the suite repeatedly:
it compared the length of two separate `listBookings()` calls, and vitest runs files in
parallel while `booking.spec.ts` inserts rows between them. The assertion now pins
"does not throw and does not collapse to an empty page" instead of a count.

What is still uncovered is the route layer itself: no test exercises an authenticated
admin request, so the CSV builder and `getStaffUser()` gating are hand-verified only.
Covering those needs a request harness. `npm run build` is also worth more than `tsc`
here — a `"use client"` export called from a server component is a runtime error that
typecheck passes cleanly.

**Pre-existing flake, unrelated to the above:** running the suite back-to-back several
times in a row, `availability.spec.ts` and `booking.spec.ts` once failed at suite load
with their tests skipped, then passed on 7 consecutive runs. The project sits on a
60-connection database with ~14 idle connections accumulating, so repeated runs are the
likely cause. Not reproduced since, and not introduced by the new file — worth knowing
before blaming a change for it.

The export itself guards CSV formula injection: customer names and phone numbers are
attacker-controllable, and a booking named `=cmd|...` would otherwise execute when
staff opened the file. Verified with a real hostile booking — the cell exports as
`'=cmd|/c calc`. That test booking was deleted afterwards.

### Stock ledger — the gap that made the ledger untrustworthy

`inventory_movements` is the source of truth: a `BEFORE INSERT` trigger applies the
delta, fills `stock_after` and rejects an oversell. Everything else routes through it —
`SALE` on booking, `IN` on cancel/expire. **The admin stock table did not.** `TableEditor`
PATCHed `snacks.stock` directly, so a correction was a bare number: no actor, no reason,
no `stock_after`, and invisible in the one place that records who moved what. The
movements table therefore showed a full history of sales while the largest single source
of stock change was missing from it.

`adminCrud()` gained an optional `beforeWrite` hook, and `/api/admin/snacks` passes one
that intercepts `stock`, inserts an `ADJUSTMENT` row, and returns the body *without*
`stock`. The column is then never written by the app. `/admin/snacks` reads the last 25
movements so the ledger is visible instead of inferred.

Two things worth recording:

- **A hook that consumes the whole body is a success, not a no-op.** The first version
  reused the existing "Tidak ada field yang diubah" 400 check *after* the hook ran, so
  editing only the stock applied the movement and *then* reported failure. The caller
  would have retried against a changed row. The check now distinguishes "nothing to do"
  from "the hook already did it", and re-reads the row so the response and the audit
  entry still show the post-change state.
- **`stock_reason` has to be in the zod schema.** Zod strips unknown keys, so declaring
  the column on the hook alone silently dropped the reason — the movement would have been
  recorded as an unattributed "koreksi stok manual". It is declared as a non-column field
  with a comment saying why.

Verified end-to-end through the real admin UI: `30 → 28` produced one `ADJUSTMENT` of
−2 with `stock_after` 28 and an actor; `28 → 30` returned 200 with one `ADJUSTMENT` of
+2. Both test movements were then deleted — they were test artifacts, not real
corrections, and a stock history is not the place to leave them. Two tests in
`tests/booking.spec.ts` pin the contract the hook depends on: an `ADJUSTMENT` applies its
delta, keeps its reason and fills `stock_after`, and one that would drive stock negative
is refused.

### Claims in this document that were wrong

Recorded so nobody re-chases them:

- **Mojibake in the generated SVG assets.** `booth.svg` shows `GANET Â· GN-V02` when read
  through PowerShell, and an earlier pass flagged it as double-encoded. It is not. The
  raw bytes are correct UTF-8 (`c2 b7` = `U+00B7`); only 2 non-ASCII bytes exist in the
  file, and game covers are pure ASCII. It was a console display artifact. Verified with
  a byte-level check, not by eyeballing the console.
- **"The DB has no `image_url` column" (as of an LSP session).** The editor's language
  server kept reporting `column 'image_url' does not exist` against a schema that does
  have it. `npm run typecheck` is authoritative and passes; the LSP cache was stale.
- **"`ui/select.tsx` imports `cn` from a bare specifier, so it would not even compile".**
  Also wrong. `cn` is a real dependency (`cn ^0.4.0`), and `src/lib/utils.ts` is just
  `export { cn } from "cn"`, so the five `ui/*.tsx` files that import it directly are
  equivalent to importing `@/lib/utils`. It was deleted because **nothing imported it**,
  not because it was broken. It is also a tailwind-merge replacement, so
  `cn("h-8", "h-12")` correctly drops `h-8` — which is why passing a height override to
  `<Input>` is safe rather than order-dependent.
- **Mojibake caused by tooling, twice, in this file's own history.** D1 was real: a
  database literal. But two later scares were *display* artifacts — the `booth.svg` `·`
  and the stale LSP `image_url` errors. And then tooling actually did corrupt source:
  editing `games/[slug]/page.tsx` through a PowerShell `Get-Content` → `Set-Content`
  round-trip re-encoded six lines as Windows-1252, so the page title rendered
  `Tekken 8 Ã¢â‚¬â€ Kyub Sukaria`. **Lesson: on Windows PowerShell 5.1, never round-trip a
  UTF-8 source file through `Get-Content`/`Set-Content` without `-Encoding UTF8`.** Use
  the editor tools or a node script. `scripts/`-side scripts are all node and were not
  affected. The damage was found by scanning the tree for mojibake byte signatures, not
  by reading the page.

## Method

- 24 real-browser screenshots via chrome-devtools MCP (15 public routes, 9 admin, desktop 1440w + mobile 390w)
- 14 Stitch designs pulled at full resolution (`=s0` on the `lh3` CDN → e.g. 2832×9410 for home)
- Each pair composited side-by-side (design left, code right) and compared feature by feature
- Design CSS values cross-checked against the compiled stylesheet and the live DOM

### Limitations — read before trusting the details

1. **Stitch HTML export URLs are expired** (404 on every screen). Spec-level comparison used the design PNGs + the design-system JSON, not the source HTML.
2. **One design asset is permanently dead:** "Admin — Booking Configuration & Pricing Rules" returns HTTP 400. `/admin/pricing` is therefore **not** visually audited.
3. Stitch render scale (~2830px) ≠ code viewport (1440px). Comparisons are structural and stylistic, never pixel-diff.
4. Findings come from visual comparison. Line numbers cited were verified by the reviewing agent against source.

---

## Root causes — fix these first, most HIGH items collapse

### R1. The shadcn `@theme inline` block silently overrides the Stitch design tokens

> **Since: fixed.** The shadowing block is gone. Everything below describes the pre-fix state.

`globals.css` declares the Stitch palette in `@theme` (lines 13–66), then a shadcn-compat `@theme inline` block (lines 93–134) redefines the **same custom property names**. In Tailwind v4 the later block wins and `inline` bakes the value into every utility.

Compiled proof from `.next/static/css/app/layout.css`:

```css
.rounded-xl { border-radius: calc(var(--radius) * 1.4); }   /* 0.5rem × 1.4 = 11.2px */
.bg-muted   { background-color: var(--muted); }              /* #2a2a2a */
.bg-secondary { background-color: var(--secondary); }        /* #2a2a2a */
```

Live DOM measurement on a real card: `border-radius: 11.2px`.

| Token | Stitch spec | Actually resolving | Impact |
|---|---|---|---|
| `--radius-xl` | `1.5rem` (24px) | **11.2px** | every card is less than half the intended softness — reads "web app", not "arcade" |
| `--color-muted` | `#6b6b6b` (Muted Controller Gray) | **#2a2a2a** | tertiary/meta text loses its brand gray |
| `--color-secondary` | `#c6c7c2` (Warm Paper Off-White) | **#2a2a2a** | light secondary became dark — silent inversion |

This is the single highest-leverage fix in the whole codebase. The design system *is* in the repo and *is* correct in the first block; the second block just wins.

### R2. Cover art does not exist anywhere in the schema

> **Since: fixed.** `image_url` exists on all four tables, the `media` bucket is live with
> storage RLS, and 58 game covers + 23 unit images are generated and rendering. Everything
> below describes the pre-fix state.

`games`, `snacks`, `units`, `branches` have **no image column at all**. `src/components/cover.tsx` is a gradient swatch that typesets the label over it, and its own docstring says *"Brand-tinted placeholder until real cover images exist."*

Every "no imagery" finding below is this one cause. `src/app/globals.css` has `.shadow-arcade*` utilities defined at lines 210–231 and **zero** call sites — the design's signature hard-edge depth is also unused.

`public/assets/` holds `lounge-booth.webp`, `mascot.png`, `mascot.svg` — all unreferenced. Stitch also holds 6 image assets (interior photo, mascot, 3 logos, favicon) never exported.

### R3. The design-system `Select` is dead code; 17 native `<select>` elements ship instead

`src/components/ui/select.tsx` (191 lines) has **0 importers** — and imports `cn` from a bare `"cn"` specifier rather than `@/lib/utils`, so it would not even compile if used. Meanwhile 17 raw `<select>` across 8 files render as unstyled OS controls (thin grey border, native chevron, 36px tall — below the design system's own 48px minimum).

Affected: `booking-form.tsx` ×4, `instant-booking-widget.tsx` ×3, `walk-in-form.tsx` ×4, `staff-manager.tsx` ×2, `table-editor.tsx`, `games/page.tsx` ×2, `admin/bookings`.

### R4. The booking funnel has no shared chrome

All 3 funnel designs put a persistent step strip + green announcement bar in the frame. `src/app/(customer)/layout.tsx` renders only header/main/footer; `Ticker` is imported by exactly one page (`page.tsx:13`). Funnel position is invisible on `/tiket` and `/payment`.

---

## Confirmed defects (not design disagreements — these are wrong)

| # | Sev | Where | Defect |
|---|---|---|---|
| D1 | **HIGH** | `supabase` `create_booking()` | **Mojibake in every RENTAL line item.** Verified: hex `c3a2 e282ac e2809d` = `â€”` (em-dash double-encoded). Renders as `Capsule 01 â€" 120 menit` on `/tiket` and `/payment` — user-visible on the totals line of a paying customer. 3 existing rows affected. Snack rows are clean. |
| D2 | **HIGH** | `games/[slug]/page.tsx:150` | Branch list links to `/cabang/${branch_id}`. That route **does not exist**. Every game-detail page 404s on both branch links. |
| D3 | **HIGH** | `tempat-main/page.tsx:84` | `Kosong jam 00.49` — 49 minutes formatted as `HH.MM`, and the wording implies a duration rather than a release time. It is a static clock, not a countdown. `kit/countdown-badge.tsx` exists and is never imported. |
| D4 | **HIGH** | `games/[slug]/page.tsx` | Dev placeholder ships to customers: *"Deskripsi lengkapnya masih dalam riset. Yang jelas: seru buat mabar di Sukaria."* |
| D5 | **HIGH** | `games/[slug]/page.tsx:60-65, 162` | `facts` (developer/publisher/release/age) is empty — all null in DB — so the entire metadata block never renders. `similar.length === 0` so the related-games block never renders and its `grid-cols-6` is dead. |
| D6 | **MED** | `instant-booking-widget.tsx` → `booking/page.tsx` | Widget emits `?type=&slot=`; the booking page reads only `unit` and `branch`. Both silently dropped. |
| D7 | **MED** | `admin/units` | Only `Maintenance` / `Offline` actions exist. **No way to return a unit to available**, so the page's own copy — *"aktifkan lagi setelah siap"* — is false. |
| D8 | **MED** | `admin/users` | Subtitle promises create/change-role/deactivate. Only "create" is implemented; no edit, role change, deactivate, or reset. |
| D9 | **LOW** | `format.ts:18` | `fmtDate` unused. `kit/chip-filter.tsx` unused. `/api/availability` and `/api/admin/booking-config` have no callers. |
| D10 | **LOW** | `games/[slug]/page.tsx`, `tempat-main/page.tsx` | Device "VIPV 01" appears to be a typo'd duplicate of "VIP 01". |

## Defects found *during* the sprint — not in the original audit

The original audit was a visual pass, so it could not see money and inventory bugs.
These were found while writing the regression tests and are the most serious defects in
the project. All three are fixed and covered by tests.

| # | Sev | Where | Defect |
|---|---|---|---|
| S1 | **CRITICAL** | `create_booking()` | **Snack stock was never decremented.** Ordering snacks on a booking did not reduce `stock` and wrote no `stock_movements` row, so the admin stock-health signal and every reorder decision were fiction. Fixed by `0010`, which writes a `SALE` movement. `0011` then fixes the guard around the *return* path: `0010`'s `old.status is distinct from new.status` check still fires when a terminal status is rewritten, which double-returned stock. |
| S2 | **CRITICAL** | `create_booking()` / cancel path | **Cancelling or expiring a booking stranded the unit in `BOOKED` forever.** 23 of 23 units were stuck. No code path released the unit, so a single cancellation permanently removed a console from the floor. Fixed by `0012` (`handle_booking_ended()`, trigger `bookings_on_ended`), which also restores snack stock and deliberately does *not* clear a unit a staff member took out of service. |
| S3 | **MED** | `sync_game_request_votes()` | The vote-count trigger ran as `INVOKER`, so it could not write the aggregate and `vote_count` never reflected the real tally. Fixed by `0015` (`SECURITY DEFINER`). |

A fourth class of bug was found in the sprint's own code, not the app's: `getGames()` and
`getRelatedGames()` had two separate `select()` string literals and only the latter
included `image_url`. The DB was correct, the column existed, and 58 cards silently fell
back to the gradient. Fixed by having both read the shared `GAME_SCALARS`. The lesson is
in `cover.tsx`: one `select()` per table, not one per query.

---

## Per-route findings

### `/` — Home
Design is image-led; code has **zero photographs** (R2).

> **Since:** unit cards now carry booth imagery (R2 fixed), and the snack/branch
> photography gap is still open — snacks are 0/12 and branches 0/2.

- **HIGH** — hero right column: design is a full-bleed lounge photo + floating device card; code is flat green-tinted empty space. Hero eats 15% of page height with dead right half.
- **HIGH** — snack cards: 6 cards with real food photography inside a rounded panel with its own 2-line headline + CTA; code is a 3×2 grid of gradients labelled with the literal words `SNACK` / `DRINK`.
- **HIGH** — "PILIH TEMPAT MAIN": design cards each carry a photo; code is 7 text-only cards, and the 7th orphans in a 3-col grid.
- **MED** — card titles use a narrower condensed face, not the Anton token the headings use.
- **MED** — branch cards lost the image block and the full-width CTA; reduced to a `Lihat Slot →` text link.
- **MED** — ticker clips mid-word (`N 24 JAM • …`); loop is not seamless.
- **LOW** — stat strip is borderless in code vs bordered tiles in design. Hero H1 tracking is wider and the green rule is dropped.

### `/games` — Catalog
**The "Request" half of the page does not exist.** Design title is *"Katalog Game PS5 & Request"*; code title is `GAMES`.

> **Since:** the request form and the ranked TOP REQUEST leaderboard **now exist**
> (sprint 4), and all 58 cards render generated cover art. **The genre filter now works
> too** — `0018_game_features.sql` filled `genre` for 58/58 and the chips render
> (17 values, client-side over the page's own result set, preserving the other filters
> in the query string). Verified: `/games` 58 cards, `?genre=FIGHTING` 7 (ARMS, Dragon
> Ball Sparking Zero, Naruto Storm 4, Street Fighter 6, Tekken 8, UFC 5, Undisputed), a
> conflicting combination 0. Still open: the H1 string, the 4-vs-3 column count, the
> inverted card aspect, and a filter panel. The "title printed twice" finding was a
> *gradient* artifact; it now reads the way real box art does, because the artwork carries
> the title and the listing repeats it.

- **HIGH** — missing entirely: the request form (`Masukkan Judul Game` + platform selects + `Kirim Request`) and the "TOP REQUEST GAMEPOP" ranked-vote leaderboard. Backend exists — `game_requests` + `game_votes` tables are in the schema, empty.
- **HIGH** — 58 items render unpaginated; design shows a curated 12. Grid is **3.42× taller** than the design's at equal width.
- **HIGH** — card anatomy reduced to ~10%: design card has ribbon badge, platform chip, player count, genre, description, full-width CTA. Code has gradient + title + platform line.
- **HIGH** — card aspect inverted: design 1:1.17 with a 16:9 art window; code 1:1.54 portrait.
- **HIGH** — no filter panel. Design has search + platform/mode/genre/location filter rows with an active-pill state; code has one input and two native selects. **Genre is not filterable at all.**
- **MED** — title printed twice (centered on gradient *and* in the footer strip).
- **MED** — 4 columns vs design's 3.
- **MED** — `GAMES` H1 is Plus Jakarta Sans Bold, not the display face used on every other page.

### `/games/[slug]` — Game detail
3 of 8 design sections absent.

> **Since:** the branch links work (D2) and the hero carries real cover art. The
> related-games block now renders via a genre-then-platform fallback, but the metadata
> block **still never renders** — 0/58 rows are populated (D5).

- **HIGH** — dead `/cabang/{id}` links (D2); branch list is 2 text rows with no address, no unit count, no CTA.
- **HIGH** — metadata block never renders (D5).
- **HIGH** — hero cover is a gradient with the title typed on it.
- **HIGH** — multiplayer is 5 inline pills; design has 6 cards with icon, description, and a supported/unsupported status word.
- **HIGH** — description section lost its second column, its 4 bullet list, and its screenshot.
- **HIGH** — filters over *all* branches, so an unavailable branch renders as a "Belum ada" card. Design only lists available ones.
- **MED** — no green eyebrow labels above headings (design: INFO / MODES / MULTIPLAYER / CABANG / REKOMENDASI).
- **MED** — `max-w-4xl` on a 1440w viewport leaves 272px dead per side.

### `/tempat-main` — Live availability
Worst gap in the customer app: a data table wearing card CSS.

> **Since:** the two worst items are fixed — cards carry unit photography and a live
> countdown, and the radius is 24px. Still open: no per-unit price, no KPI strip, no
> facility-type filter, no last-updated signal, no status legend, and 3 columns vs 4.

- **HIGH** — no unit photography; cards are text rows (R2).
- **HIGH** — no countdown (D3).
- **HIGH** — no per-unit price anywhere on a rental page. `StationCard` has no price field.
- **HIGH** — no KPI strip (design: Total / Tersedia / Dipakai / Maintenance / Rata-rata durasi).
- **HIGH** — no facility-type filter (design: 7 chips — Regular PS5, Capsule, VIP, VIP Suite, Racing Rig, Switch). Only branch filter exists, so you cannot isolate PSVR2 or VIP units.
- **HIGH** — no "last updated" / live-freshness signal, on a page whose entire premise is real-time.
- **HIGH** — missing status legend (design: 5-step READY/PAY/CLEAN/BOOKED/SERVICE key).
- **MED** — 3 columns vs design's 4 → 2-card orphan row at the bottom.
- **MED** — `Nintendo Switch 01` renders `Nintendo Switch · Nintendo Switch · Ganet` — facility and platform are the same value, separator is meaningless.
- **MED** — radius 11.2px vs 24px (R1); `.shadow-arcade` unused (R2).

### `/booking` — Funnel
Working 3-step wizard against a 7-step design. The tactile selection UI the design is built around is absent.

> **Since:** the time slot is no longer a bare `<select>` of 48 strings — it is a
> 48-tile grid with per-slot state (`AVAILABLE` / `BOOKED` / `IN_USE` / `CLEANING` /
> `PAST`) from the `slot_availability()` RPC, and the default date is timezone-correct.
> The 3 remaining selects (branch, duration, game) are now `SelectField` at the design's
> 48px minimum. Still open: the native `<input type="datetime-local">`; duration is still
> a select and **`OPEN PLAY` still does not exist anywhere in the repo**.

- **HIGH** — **all four selectors are raw native OS controls**, verified at `booking-form.tsx:202, 263, 278, 348` plus a native `<input type="date">` at `:259`, all sharing `h-9 w-full rounded-lg border border-input bg-card px-3 text-sm` (R3).
- **HIGH** — duration selector: design = 5 connected tactile tiles (1/2/3/4/5 JAM · OPEN PLAY); code = a `<select>`. **`OPEN PLAY` does not exist anywhere in the repo.**
- **HIGH** — time slots: design = a 12-tile matrix with per-slot state (`Sedang Main / Selesai 18:30`, `Lagi Disiapkan / Siap 18:45`, green `AVAILABLE` + `GAS LANGSUNG`) and a legend; code = a `<select>` of 48 bare `HH:MM` strings. The single most useful feature on the page — *why* a slot is unavailable and *when* it's ready — is gone.
- **HIGH** — date picker: design = 5 date tiles + "PILIH TANGGAL LAIN"; code = native date input.
- **HIGH** — branch picker: design = 2 venue cards with description, feature tags, live availability counts, selected-state ribbon; code = one `<select>`.
- **HIGH** — unit picker: design = photo cards with price, capacity, console type, availability pill, CTA; code = a 1-column stack of 44px rows.
- **HIGH** — no sticky price rail. Price is a plain div at the bottom of step 3, so there is no running total while choosing a slot.
- **HIGH** — game & snack demoted to raw `<select>` and `<input type=number>` on step 3; design gives them their own steps with poster cards, filter pills, and −/+ steppers.
- **MED** — single ~430px column vs design's 2-column console → ~240px dead per side.
- **MED** — off-brand CTA green: the `PILIH WAKTU →` button samples `rgb(29,94,41)` ≈ `#1D5E29` at ~55% brand luminance. It is the only off-brand green in the funnel (`/tiket` and `/payment` sample correct `#20a83a`).

### `/tiket/[code]` — E-ticket
A flat text summary. Roughly a third of the designed content volume.

> **Since:** the mojibake on the totals line is fixed, the unit thumb renders real
> imagery, and the hydration mismatch in the countdown is gone. **Also shipped:** a QR
> block encoding the absolute ticket URL, a copy button on the booking code, a WhatsApp
> share link, and the branch address the query already selected but never rendered. Still
> open: no success state, no tear-off ticket treatment, the countdown is still a small
> amber `MM:SS` rather than the design's large mono `HH:MM:SS`, and the customer name is
> still 12px grey next to a 48px swatch.

- **HIGH** — mojibake on the totals line (D1).
- **HIGH** — no tear-off ticket treatment, no perforation, no tab, no boarding-pass header rail.
- **HIGH** — no success state at all. No glowing check, no `BOOKING BERHASIL! / SIAP GAS.`, no instructions. The page opens cold at a small grey "Tiket" label.
- **HIGH** — booking code is a bare `h1` with **no copy button**. It is the most-used element on the page.
- **HIGH** — **no PIN / unlock code** and **no QR block**. No QR library in `package.json`. A customer arriving with this page has nothing to scan — functional gap, not cosmetic.
- **HIGH** — actions: 2 buttons (Bayar / Batalkan). Design has 4, including **WhatsApp share — and the customer's WhatsApp number is captured in the form then never used.**
- **HIGH** — no location section. The page query already selects `branches.address` and **never renders it.**
- **HIGH** — countdown is `04:33` (mm:ss, no hours) in a small amber inline box; only for `WAITING_PAYMENT`. Design's is large mono `02:44:11` and is the emotional core of the page.
- **MED** — date rendered twice, two formats, two lines apart: `30 SEPTEMBER 2026 PUKUL 00.30` then `sampai 30 September 2026 pukul 02.30`.
- **MED** — customer name is 12px muted grey next to a 48px generated gradient swatch.

### `/payment/[code]` — Payment
**Functionally the page is a button.**

> **Since:** the core task is now performable — 5 selectable payment channels, stored
> on the booking and forwarded to Midtrans as `enabled_payments`, with a live countdown
> and a payment summary. Still open: no summary rail/sticker, no support block, the
> `PEMBAYARAN` H1 string and scale, and none of the gateway-error states.

- **HIGH** — **zero method selection UI.** Design shows 5 selectable itemised cards (QRIS / GoPay / ShopeePay / Transfer Bank / Kartu), each with radio, description, brand badge, feature chips. Code has one `StartPaymentButton` that POSTs and hard-redirects to Midtrans Snap. The five methods are a prose string: `QRIS · GoPay · … — via Midtrans`. The core task of the page cannot be performed.
- **HIGH** — no countdown. Design has `SISA WAKTU PEMBAYARAN 14:28` live in display type plus `Bayar sebelum 21:45 WIB`. Code has one static line: `Sebelum 30 September 2026 pukul 00.53`.
- **HIGH** — no summary rail, no itemisation, no booking-code pill, no customer pill, no support/WhatsApp block.
- **HIGH** — funnel chrome absent (R4).
- **MED** — ~30% width utilisation. Content is `max-w-md` (448px) in a 1440w viewport.
- **MED** — H1 is `PEMBAYARAN` at `text-3xl`; design is `PILIH METODE PEMBAYARAN` at display-hero scale. Wrong string *and* wrong scale.
- **MED** — no "QA simulator" state tabs (processing / gateway error / session expired). None of the page's error states exist.

### Admin (9 routes, authenticated as Owner)

**Since:** the shell is implemented. Sidebar lockup + `● PORTAL OPERASIONAL STAFF` eyebrow,
three grouped nav sections with lucide icons, a real active state (`aria-current`, and
`/admin` matches exactly so it does not light up on every page), the shift pill, the
identity block, and a topbar with the `● LIVE · DATA REAL-TIME` pill, the date chip and
the identity avatar. The "live" claim is backed by `LiveRefresh` (10s `router.refresh()`,
paused while the tab is hidden) rather than being decorative.

**Still missing on every admin page:** the green eyebrow labels above headings (only
`/admin/customers` and `/admin/audit-log` have one, as a pre-existing `CRM` /
`Akses & Keamanan` kicker), and the `AKSICEPAT OPERASIONAL KASIR` shortcut bar on the
dashboard.

**KPI cards shipped** on 10 of 11 routes via one shared `StatCards`
(`src/components/admin/stat-cards.tsx`), extracted from the markup that had been
inline on the dashboard. Every number is computed from rows the page already fetches —
a card never triggers a second query. `/admin/walk-in` is deliberately excluded: it is
a form, and a count of nothing is not a KPI. The bespoke `Stat` component on
`/admin/customers` was deleted rather than kept alongside.

| Route | KPI strip |
|---|---|
| `/admin` | Sesi aktif · Menunggu bayar · Booking aktif · Omzet hari ini |
| `/admin/bookings` | Ditampilkan · Aktif · Dipakai · Menunggu bayar · Dibatalkan · Nilai terfilter. Reads off the already-filtered rows, so with a filter active it describes the filtered set. |
| `/admin/units` | Total · Tersedia · Dipesan · Dipakai · Antrian/dibersihkan · Maintenance/Offline. Covers **every** value of the `unit_status` enum exactly once, so the cards must sum to the total (verified 22+0+0+1+0 = 23). |
| `/admin/snacks` | Menu aktif · **Stok habis** · **Stok menipis** · Nilai stok. The two middle cards are the design's core signal and were entirely absent; without them `stock` was a number nobody could act on. |
| `/admin/games` | Total game · Cover ada · Metadata lengkap · Metadata kurang. Also gained **Publisher** and **Rilis** columns — the 0017 backfill had no column to live in, so the data existed in the database and was invisible and uneditable in the only screen that manages it. |
| `/admin/users` | Akun staff · Aktif · Nonaktif · Owner · Admin · Staff |
| `/admin/customers` | Total pelanggan · Pernah booking · Total transaksi. The label used to read **"Nilai Polkadot"** — a crypto chain, not a metric. |
| `/admin/audit-log` | Entri dimuat · Setelah filter · Jenis entitas · Pelaku · Terakhir |
| `/admin/feedback` | Jumlah feedback · Keseluruhan · Pelayanan · Unit · Kebersihan |
| `/admin/pricing` | Aturan aktif · Cabang tercakup · Fasilitas tercakup · Jenis paket. The coverage card turns amber when a facility type has no price, which is why a booking form can be missing an option. |

The `date` column type added to `TableEditor` for `Rilis` sends `null` on clear, and
`gameSchema` accepts only `^\d{4}-\d{2}-\d{2}$` or null — a partial date would be
rejected by Postgres anyway, and a loud 400 beats a 500 from a bad cast. Verified
end-to-end: editing a publisher, setting a date, and clearing a date all persist.

| Route | Notable |
|---|---|
| `/admin` | Has the 4 KPI cards and the live unit grid, but no `AKSICEPAT OPERASIONAL KASIR` shortcut row (the design's keyboard-driven `[F1]`–`[F5]` action bar), no alert strip, no unit-status filter pills, no `PERINGATAN STASIUN` panel. |
| `/admin/bookings` | No table — 3 prose run-on cards, no header row, no column alignment. Per-row actions on 1 of 3 rows only. No `Refresh` / `Export CSV` / `+ WALK-IN` buttons. Title `BOOKING` vs design `BOOKINGS`. **Since:** all of it shipped — a 9-column table (Kode, Status, Customer, Unit, Jadwal, Durasi, Total, Sumber, Aksi) with a header row and right-aligned numeric columns, actions on every actionable row with a dash on terminal ones, plus `Export CSV` and `+ Walk-in`. **And the search box was found broken while testing the export — see below.** |
| `/admin/units` | No stat cards, no search, no filters, no sort, no add-unit action. 3-col card grid vs design's master-data table keyed on unit codes. Ambiguous duplicate rows (`Capsule 01` appears for both Batu 5 and Ganet, no code to disambiguate). Mixed language: `TERSDIA`/`DIPESAN` beside `Maintenance`/`Offline`. Unit photo + upload/delete shipped. **Since:** the card grid is now a master-data table keyed on `unit_id` — which is what disambiguates `Capsule 01` at Batu 5 from `Capsule 01` at Ganet (`B5-C01` vs `GN-C01`) —    with search, branch and status filters, sortable headers, and a Reset link. 14 tests cover the query builder. **Add-unit was deliberately not built:** `src/app/api/admin/units/route.ts` documents that units are seeded master data and that `adminCrud`'s DELETE would hard-delete a row referenced by bookings, reservations and stock. The mixed-language status labels remain — that is a copy decision spanning the customer-facing pages, not a defect in this route. |
| `/admin/snacks` | No stat cards, no stock-health status (`MENIPIS`/`HABIS` is the design's core signal and is entirely absent), no stock-movement ledger, no Stock In / Stock Opname / Export. Every cell is a raw `<input>` — reads as a spreadsheet. `KATEGORI` is free text, not a select. `15000` unformatted vs design's `Rp 15.000`. Permanent `Simpan` on every row with no dirty state. Cover-art upload shipped. **Since:** the 4 stock-health cards and the stock-movement ledger shipped, and a manual stock edit is now recorded as an `ADJUSTMENT` movement instead of overwriting the column — so the ledger the design asked for is finally the truth. `KATEGORI` is still free text and the cells are still raw inputs. |
| `/admin/games` | `DEVELOPER`, `AGERATING`, `DESKRIPSI` blank for **all 58 rows** — only `NAMA` is populated. Names truncated mid-word by input width (`Call of Duty: Blac`, `EA Sports FC 25`). No platform / genre / availability column. No filters, no sort (row order is arbitrary: `GM-001, GM-040, GM-018, GM-053…`), no pagination, no PSN sync, no export. **Since:** a cover-art column and upload/replace/delete UI exist (R2), but the metadata is still blank. |
| `/admin/users` | Table is a single card with **one** user; design states `4 Akun Aktif • 1 Nonaktif`. See D8. Role pill has no icon. Inputs are placeholder-only with no labels, validation, or error state. **Since:** the role `<select>` is now a `SelectField`; `/admin/audit-log` shipped and the customers page moved to `/admin/customers`. |
| `/admin/customers` | **New since the audit** — CRM list over the `customers` table, which now holds 7 rows. Counters verified live after `complete_booking()`. |
| `/admin/audit-log` | **New since the audit** — renders `audit_logs` with a field-level diff. The table holds 1 row. |
| `/admin/walk-in` | Captured, not yet compared. |
| `/admin/feedback` | **No Stitch design exists for this route** — the only route in the app with no design. |
| `/admin/pricing` | **Design asset is dead (HTTP 400).** Not audited. Its 75 `SelectField`s render at 32px, aligned with the text inputs in the same rows. |

The design's sidebar also lists **Live Unit Monitor**, **Check-in / Out**, **Payments** and
**Settings**. None has a page in this app, so they are absent from the nav rather than
present as links that 404. Same reasoning for the topbar's **branch selector** and
**notification bell**: no admin page reads a branch filter and there is no notifications
table, so shipping either would be a control that looks live and does nothing.

### Untouched (captured, not compared)
~~`/cabang`, `/snacks`, `/promo`, `/cek-booking`, `/feedback`, `/login`, 404, `/extension`.~~ **Compared — see below.**

## The 8 never-compared routes

Run last, desktop only — 24 of the 80 Stitch screens are mobile variants and those are
still uncompared. **Layout and structure only**: design copy is placeholder, so the
`/cabang` design saying "Tanjungpinang" for a branch that is Batu 5 or Ganet is not a
defect. Colour, type, spacing, iconography and imagery were out of scope.

Two practical notes from the run: Stitch `downloadUrl` tokens are **single-use** (the
second fetch 400s), and `/snacks` has **no desktop design at all** — only `Snack Mobile`
and a separate marketing screen, `Snack Pit-Stop`. So seven comparisons were possible, not
eight.

| Route | Verdict |
|---|---|
| `/cabang` | 2 of 2 branch cards exist; almost everything around them does not |
| `/cek-booking` | Lookup shell only — the entire post-lookup flow is missing |
| `/extension` | Read-only stub; the write path does not exist |
| `/feedback` | Built, but on a **different rating model** than the design |
| `/login` | One of two auth modes; six support/status blocks absent |
| `404` | **No site chrome at all** — no header, no footer |
| `/promo` | Empty state only; cannot be built without a schema change |
| `/snacks` | No desktop design to compare against |

### What the comparison actually found

Most of these are **not layout gaps**. Four of seven are missing data, a missing RPC, or a
missing schema — which is why they sat untouched while the routes looked finished:

- **`/extension` has no write path.** `extension.service.ts` carries a `ponytail` note that
  the extension RPC was never written. So there is no option selection, no payment, no
  draft state, and none can be added as UI. The design wants three extension options with
  cost and resulting end time; live has zero. The query already fetches `duration_minutes`,
  `scheduled_end_at` and `branch_id`, so the schedule and cost blocks could render today —
  but the selection itself is blocked on the RPC.
- **`/promo` needs a schema change.** `getPromotions()` selects `name, description, status,
  branch_id, promotion_items(duration, price, facility_type)`. The design needs a promo
  **code**, a **time window**, per-tier pricing with strikethrough, spec attributes and
  terms. None are stored. There are also 0 promotions in the database, so the only
  reachable state today is the empty state. Every CTA on the design's page is missing, and
  the cards live renders are inert divs with no links.
- **`/feedback` is built on a different data shape.** The design is one overall 1–5 rating
  plus 7 boolean "what did you like" aspects. Live is four independent 1–5 star groups
  (`feedback-form.tsx`). These are different payloads, not a visual disagreement — changing
  it is a schema and client change, and it would discard collected data.
- **`/login` needs an OTP provider.** The design's second mode is WhatsApp OTP. The
  service file already notes phone OTP "needs Twilio money; revisit at launch". The
  remaining six gaps (visibility toggle, forgot-access modal, branch selector, security
  notice, system status strip, staff-help block) are real but cosmetic, and the status
  strip would show values nothing in the app measures.

The genuinely cheap, real ones:

- **404 has no header or footer.** `src/app/not-found.tsx` sits above the route group, so
  `SiteHeader`/`SiteFooter` from `(customer)/layout.tsx` never wrap it — a visitor who hits
  a bad link lands outside the site. Also one CTA where the design has four destinations.
  **Fixed.** See the note below, because the obvious fix does not work.
- **`/cabang` omits everything except the cards.** Per branch the design has a live
  availability block, tier breakdown, an access note, Google Maps + WhatsApp actions and a
  6-item amenity grid; and below the cards it has a whole navigation guide (4 origins, 8
  travel-time rows), a 3-item FAQ and 2 CS contact cards. **The availability block shipped**
  — see below.
- **`/cek-booking` is a lookup form that redirects.** The design keeps the active-session
  panel, payment chip, invoice breakdown, extension section, blocked state and quick
  actions on the page. Some of that may be covered by `/tiket/[code]`, which needs
  checking before any of it is called missing.

### Cheapest wins, ranked

1. ~~404 site chrome~~ — **shipped**.
2. ~~`/cabang` availability block~~ — **shipped**.
3. Everything else is a schema, RPC or provider decision before it is a UI decision. See
   the four bullets above; none of them is a styling job.

### 404 chrome — moving the file does not work

The obvious fix for the missing 404 chrome is to move `src/app/not-found.tsx` into the
`(customer)` group so it inherits the group layout. **That does not work**, and it fails
silently:

- `app/not-found.tsx` is the handler for **any unmatched URL in the whole app**. It renders
  inside `app/layout.tsx`, which is deliberately chrome-free.
- `app/(customer)/not-found.tsx` is a *nested* boundary. Next only uses it for
  `notFound()` thrown from a route inside that group — it is not a fallback for unknown
  paths.

Measured, not assumed: moving the file left `GET /zzz-no-such-route-404-probe` returning
Next's built-in 404 with no `<header>`, no `<footer>` and no nav, and with the project's
custom copy (`Kamu nyasar`) gone from the response entirely. Moving it back restored the
custom page. So the fix is to **apply the chrome inside `not-found.tsx` itself** — reusing
`SiteHeader`/`SiteFooter` from `@/components/site-chrome`, which is what
`(customer)/layout.tsx` already does, rather than duplicating either the component or the
layout tree.

Shipped in `src/app/not-found.tsx`:

- `SiteHeader` + `SiteFooter`, so a bad URL is still inside the site.
- A real `<h1>` (it previously had **zero** `h1`, `h2` and `h3` — the 404 numeral was the
  only heading-like element) plus an `<h2>` for the recovery section.
- The design's second CTA (`Booking Sekarang`) alongside Home.
- A 5-card "Rute Cepat Lainnya" grid — Games, Tempat Main, Promo, Snacks, Cabang. The
  design's list was Games, Tempat Main, Promo, Cabang, Club; `Club` is not a route, so
  `Snacks` stands in.

Deliberately not built: the design's status-code meta line, signal icon and kasir-help
block. Those are decoration, and the help block needs a WhatsApp number that is not in the
codebase yet.

### Cheap win 2 — `/cabang` live availability

`getUnitsWithFacility()` already selected `branch_id`, `status` and `facility_types.name`
and the page just threw them away, so this was reading data the app already had.

Added `src/lib/branch-availability.ts` — `branchAvailability()` and `groupByBranch()`, both
pure and import-free so a node test can call them without loading the Supabase server client
that `catalog.ts` pulls in at module scope. The card now shows a `2 kosong` / `Penuh` badge,
a `2 dari 9 unit tersedia sekarang` stat line, and a per-tier `available/total` strip.

Only `AVAILABLE` counts as bookable; `BOOKED`, `IN_USE`, `IN_ORDER`, `MAINTENANCE` and
`OFFLINE` do not. Tiers sort by name so the card renders identically every request, and a
unit with a missing `facility_types` row buckets as `Lainnya` rather than being dropped from
the total — which would otherwise make the total disagree with the visible rows.

Verified against the database rather than against the mock: Batu 5 shows 2/9 (Capsule 1/2,
Regular 1/6, Steering Wheel 0/1) and Ganet 2/14 (Nintendo Switch 2/2, everything else 0).
`tests/branch-availability.spec.ts`, 6 tests, covers the status filter, the tier split, the
sort, the null-facility bucket, the empty branch, and the per-branch grouping.

Not built: the amenity grid, access notes, Maps/WA buttons, navigation guide and FAQ. The
amenities need a `branch_amenities` table that does not exist, and inventing "Free WiFi" or
"parking for 50 cars" would be fabricating claims about a real business.

---

## Designs with no route (backend is already there)

**Since:** four of the five shipped in sprint 4. Only Analytics and Feedback remain.

| Design | Screen | Status now |
|---|---|---|
| Admin Reports & Analytics | `c07840e4de7b484fa00b0c2db18d34b6` | **Open** — still no analytics queries |
| Admin Audit Log | `825803bd5ab5484ea124385d71e0e32b` | **Shipped** — `/admin/audit-log`, renders a field-level diff |
| Admin Customers & CRM | `bc614c8f37fe4a66921d617ed3122240` | **Shipped** — `/admin/customers`; counters verified live after `complete_booking()` |
| Game Request & Voting | `583667d4519e4ea6a62c441c16a3e250` (D+M) | **Shipped** — request form + ranked TOP REQUEST leaderboard + voting on `/games` |
| Unit detail | `8a4c32b0e8394e3180012290e99dfd04` (D+M) | **Shipped** — `/units/[unit_id]`, keyed on `unit_id` because names repeat across branches |
| Admin Feedback | — | **Open** — no design exists |

---

## Ruled out — not defects

Recording these so nobody re-investigates them:

- **Circular "N" badge floating in the gutter** (flagged independently on `/`, `/games`, `/games/[slug]`, `/admin/games`). It is the **Next.js dev-mode tools button** — confirmed: `nextjs-portal` is present in the DOM. Dev-only, absent in production build.
- **Dark maroon region below content** on several pages. Artifact of **my composite script** — I filled the canvas red as the divider colour, so it shows wherever the code screenshot is shorter than the design. Not an app bug. The underlying *fact* is real and is reported above: the code pages are much shorter than the designs (density gap).
- **"OMZET HARI INI Rp 50.000 looks hardcoded"** — that was the audit fixture booking created for this review (`SR-KEMPW2`, Rp 50.000). Not a placeholder. **Since:** the DB now holds 7 bookings with distinct totals (15.000 / 30.000 / 40.000 / 45.000 / 50.000 / 67.000 / 139.000) across EXPIRED, COMPLETED and CANCELLED — the figure is per-booking data, never a constant.
- **"SES AKTIF 0 while 2 units show DIPESAN"** — consistent: those units were *booked for later*, not in session. Worth a glance, not a bug. **Since:** units are 22 AVAILABLE / 1 IN_ORDER, which is what the 23-unit booth-imagery pass renders against.
- **admin/games showing "Nintendo Switch" on a PS rental site** — the `platforms` table seeds 4 platforms by design; the catalog genuinely lists Switch titles. Data-model question, not a UI defect.
- **`ASSASSIN'S CREED MIRROR` / `BATTLEFIELD 1` in the catalog** — seed-data quality in `sukaria_master_dataset_v0_1`, outside UI scope.

---

## Original plan (as first recommended) — kept for the record

**Tier 0 — correctness, do first (≈1h)**
1. ~~D1 mojibake~~ — shipped as `0009`
2. ~~D2 dead `/cabang/{id}` route~~ — shipped
3. ~~D4 placeholder copy on game detail~~ — shipped
4. ~~D3 `Kosong jam 00.49` formatting~~ — shipped

**Tier 1 — one config change, biggest visual win (≈2h)**
5. ~~R1: stop the shadcn `@theme inline` block from shadowing the Stitch tokens~~ — shipped

**Tier 2 — components, not assets (≈4h)**
6. R3: fix the `cn` import in `ui/select.tsx` and swap the 17 native `<select>`s — **open**
7. ~~Apply `.shadow-arcade` to cards/buttons/tiles~~ — shipped (9 call sites)
8. D5: populate `developer`/`publisher`/`release_date`/`age_rating` or drop the block — **open, 0/58**
9. D6: wire `?type=&slot=` through to the booking page — **open**

**Tier 3 — needed a scope decision**
10. ~~R2 cover art~~ — shipped (Supabase Storage bucket + generated placeholder art)
11. ~~`/payment` method selection UI~~ — shipped (5-channel picker)
12. `/tiket` QR + PIN + copy-code + WhatsApp share — **open**
13. Admin shell: topbar, sidebar icons + active state, KPI cards — **open**
14. ~~The 4 page-only designs~~ — shipped
15. Admin CRUD: filters, stat cards, real tables, D8, and the blank metadata columns — **partly open**

**Explicitly depriorised:** pixel-level spacing/radius tuning beyond R1, and the 8
captured-but-uncompared routes — the pattern is already unambiguous.

## Snack art — shipped 12/12, and why branches were skipped

`scripts/generate-media.mjs` already produced 58 game covers and 23 unit booths. Snacks were
the same exercise with one extra constraint: the cards render at `aspect-[4/3]`, so the
existing 3:4 portrait game art would have been cropped. `snackCover()` emits 1200x900.

Text-free, for the same reason `unitCover()` is: the snack card prints the name right beside
the image, and a photo of popcorn does not have "Popcorn" written across it. What separates
them is the silhouette, picked from `category` so a menu reads at a glance — `DRINK` gets a
tall cup, `COMBO` a stacked pair, everything else a bowl — with tint and geometry jittered
off a hash of `snack_id + name` so no two items look identical.

`link()` had a latent bug that blocked this: it derived the primary key column from the
table name with `table === "games" ? "game_id" : "unit_id"`, so any new table would have
been patched on the wrong key. It now takes the key from a map and throws on an unknown
table rather than silently PATCHing `unit_id`.

### Why branch art was not generated

The item read "snacks 0/12 and **branches 0/2** still render the gradient fallback". Only
half of that is true. Grepping for a consumer of `branches.image_url`:

- `catalog.ts:94` **selects** it, in `getBranches()`.
- Nothing renders it. `cabang/page.tsx`, `cabang/[branch_id]/page.tsx` and
  `site-chrome.tsx` never pass a branch `image_url` to `<Cover>`. The three `<Cover>` calls
  on the branch detail page are for a unit, a game and a snack.

So branch art would have been 2 files in storage that nothing displays — the `/cabang`
cards have no image frame at all to put one in. Generating them is recorded as a comment at
the fetch site so the next person adds `branches` to the script in the same commit that
gives the column a consumer, rather than shipping invisible files.

### Verification

Validated before touching the database, because a malformed SVG is worse than the gradient
it replaces: rendered all four shape branches in isolation, checked for `NaN`/`undefined`,
parsed each as XML, then eyeballed them in the browser. `node scripts/generate-media.mjs`
reported 58 games + 23 units + 12 snacks; the DB confirms 12/12 snacks, 58/58 games and
23/23 units carry an `image_url`, and `GET /snacks` renders 12 images that all load.

One false alarm worth not repeating: the first browser check reported all 6 home-page snack
images broken (`naturalWidth === 0`). They were `loading="lazy"` and below the fold —
`complete` was `false`, and `curl` on the same URLs returned 200 `image/svg+xml`. Scrolling
them into view showed 6/6 loaded.

---

## D6 — the instant-booking widget's choices were being thrown away

Not a styling gap. `instant-booking-widget.tsx` on the home page lets a visitor pick a
console type and a start time, then navigates to `/booking?branch=…&type=…&slot=…`. The
booking page destructured only `unit` and `branch`:

```ts
searchParams: Promise<{ unit?: string; branch?: string }>;
const { unit, branch } = await searchParams;
```

So "Tipe Konsol / Room" and "Waktu Mulai Main" were silently discarded — the visitor picked
"Begadang Pass (23:00 WIB)", landed on today's date with nothing selected, and had to
re-enter the choice. Two thirds of that widget did nothing.

Wired both through, with the logic in a new pure module `src/lib/slot-preset.ts`:

- **`type` (a `facility_type_id`)** filters the step-1 unit picker. A banner states the
  active filter and how many units it hid, with a **Semua tipe** button to undo it —
  without an escape hatch, applying a URL-supplied filter is a trap.
- **`slot` (`evening` / `midnight` / `tomorrow`)** sets the step-2 date and preselects the
  matching free slot. "Main Sekarang" sends no `slot` and keeps today's default.

Two things the implementation had to get right:

- **`fmtTime` prints `20.00`, not `20:00`.** `id-ID` with `timeStyle: "short"` uses a dot as
  the separator, which is what the slot buttons render today. Matching on that string would
  have been fragile, so `pickSlotStart` compares minutes-since-WIB-midnight instead.
- **A preset with no exact slot must not fail.** The grid steps in 30 minutes, so 20:00 can
  legitimately be taken while 20:30 is free. `pickSlotStart` takes the exact slot when it is
  free, otherwise the earliest free slot at or after it, otherwise `null` — which leaves the
  visitor choosing rather than silently booking a time they did not ask for.

### A real bug the tests caught

`isSlotPreset` was first written `value in SLOT_PRESETS`. That walks the prototype chain, so
`/booking?slot=constructor` and `?slot=toString` passed the guard and would have read
`undefined` out of the preset table. It is a URL, so it is attacker-reachable. Fixed with
`Object.hasOwn`, which throws on a non-string instead of coercing.

`tests/slot-preset.spec.ts`, 12 tests, covers all three presets, the WIB-vs-UTC date
boundary, the exact/fallback/none slot resolution, the empty and fully-booked grids,
non-mutation of the caller's array, and the prototype-chain inputs above.

Verified in the browser, not just in tests:

| URL | Result |
|---|---|
| `?type=FAC-CAPSULE&slot=evening` | 2 Capsule units, "6 unit disembunyikan", date today, **20.00 selected** |
| `?unit=B5-C01&branch=BR-B5&slot=tomorrow` | date **2026-10-03**, 48-slot grid, **14.00 selected** |
| `?unit=B5-C01&branch=BR-B5&slot=constructor` | page renders, 48 slots, **nothing preselected**, no error |

---

## `/tiket` — countdown, success state, headings

Compared against `10f9e2195fb84c629fca65d7b92cfcef` ("Tiket & Konfirmasi Booking").

**One of the three items in this audit row was wrong.** It called for "the tear-off
treatment". The design has no perforation, notch, dashed cut line or stub — its split
between the payment proof and the boarding pass is semantic, two stacked sections in one
column. Chasing a tear-off would have been building a feature nobody designed.

What the design actually has, and what shipped:

- **A countdown to session START**, `HH:MM:SS`, in its own centred block above the
  boarding pass. Live had no start countdown at all — only a payment-deadline timer and,
  once playing, an end timer. Now `CONFIRMED` gets the start timer, `IN_USE` keeps the end
  timer, and neither is shown when it does not apply.
- **A real success state.** The design leads a paid ticket with
  `PEMBAYARAN AMAN VIA MIDTRANS • LUNAS` and a success headline. Live's `CONFIRMED` branch
  added a single muted paragraph, so a paid booking looked almost identical to an unpaid
  one — the one state difference that matters most was the one that rendered least.
- **`HH:MM:SS` instead of `MM:SS`.** The old format rendered a 90-minute session as
  `90:00`, which reads as ninety minutes rather than one hour thirty.

Also fixed, and not design-specific: **the page had zero `<h2>`/`<h3>`.** Every section
label — "Tunjukkan di kasir", "Waktu", "Tempat", "Rincian" — was a `<p>`, so heading
navigation for a screen-reader user yielded the booking code and nothing else. Four are
now real headings.

`src/lib/countdown.ts` holds the formatter (pure, 6 tests): zero-padding, clamping at zero
rather than counting negative, and truncating rather than rounding so it never shows a
second early.

### Verified against a real booking

No fixture was in `CONFIRMED` or `IN_USE` — all eight were terminal — so a booking was
created through the real `POST /api/bookings` and its status flipped to inspect the paid
state. Pending path showed `00:14:33` to the payment deadline with 4 headings; `CONFIRMED`
showed the LUNAS hero and `11:06:01` to session start with 6 headings.

Two things that looked like bugs and were not, both worth recording:

- The unit booth image reported `complete: true, naturalWidth: 0`. It was a **stale
  browser cache** entry, not a broken asset: `curl` returned 200 `image/svg+xml`, the
  payload parsed as valid XML, and the same URL decoded to 1200x800 in-page when fetched
  with a cache-buster. A hard reload cleared it. Same shape as the earlier snack-image
  false alarm.
- The **ledger behaved correctly under cancel**: `SALE -1` (stock 29) then `IN +1`
  (stock 30), net zero. Worth confirming rather than assuming.

---

## `resolve_customer()` renames real customers — needs a decision

Found by accident, not by reading a design. `0007_booking_rpc.sql:47-62` resolves a
customer by phone and then overwrites the stored name:

```sql
select customer_id into v_id from customers where phone = trim(p_phone) ...
update customers
   set name  = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
       email = coalesce(...)
 where customer_id = v_id;
```

Verifying the ticket page meant creating a booking. The phone number I picked,
`081234567890`, already belonged to `CUS-000030` — a customer attached to `SR-KEMPW2`,
a 2026-09-29 fixture. My booking renamed that row, and because every booking renders
through the shared customer row, the older ticket now displays the wrong name too.

**Phone-as-identity with "latest name wins" is defensible** — a customer may well fix a
typo on a second visit, and phone is the stable identifier for this kind of venue. What
is not defensible is that it happens silently and unlogged:

- The `update` inside the RPC does not write to `audit_logs`, so there is no record of the
  rename.
- Two people sharing a phone (a family, a group booking) means booking #2 renames #1, and
  every historical booking for that phone then reports the wrong customer.
- The original name was **not recoverable**. Not from `audit_logs`, not from
  `booking_items`, and `supabase/seed.sql` has no customer rows. `CUS-000030` now reads
  `? (nama tertimpa verifikasi 2026-10-02)` rather than a plausible-looking guess, so it
  cannot pass for real data.

Worth deciding: whether the name should be overwritten at all, or only ever *filled in*
when empty. The second option keeps the typo-fix benefit for a first correction while
stopping a later booking from silently rewriting history.

Pinned by a test in `tests/booking.spec.ts` that asserts the current overwriting
behaviour, including the fact that the older booking inherits the new name. If the RPC
stops overwriting, that test fails and the change has to be a deliberate act.

---

## What remains

Ordered by value per hour. Everything above this line is either shipped or marked open.

1. ~~**404 has no site chrome.**~~ Fixed, but **not** by moving `not-found.tsx` into
   `(customer)` — that silently falls back to Next's built-in 404. The chrome now lives
   inside `not-found.tsx` itself. Also added the missing `<h1>`, the design's second CTA and
   a 5-card recovery grid. See the note in the comparison section above.
2. ~~**`/cabang` is two cards and nothing else.**~~ The per-branch availability block
   shipped — `2 kosong` badge, `2 dari 9 unit tersedia sekarang`, and a per-tier
   `available/total` strip, all from `getUnitsWithFacility()` which already had the data.
   Still missing: the amenity grid, Maps/WA buttons, navigation guide and FAQ, all of which
   need content that does not exist in the database yet.
3. **`/promo`, `/extension`, `/feedback`, `/login` are not layout tasks.** Each needs a
   schema change, a missing RPC, a different payload shape or a paid provider before any
   UI is possible — see the comparison above. Decide those deliberately, not as UI work.
4. **Mobile designs — all 24** — remain uncompared, as chosen.
5. ~~**`/admin/reports` Section 4.**~~ All five sections shipped, plus CSV export and the
   design's five QA states. `Most Played Games` still needs the booking funnel to capture
   a game choice, and the discount, cashier-shift and VIP-tier cards need schema that does
   not exist — see the table above.
6. **`age_rating` — 0/58, left null on purpose.** Wikidata stores PEGI (`P910`) as a
   reference to a rating *item* rather than a value for 56 of 58 games, so the harvest
   could not produce a number. A wrong age rating is worse than none on a customer's
   screen, and the UI already omits absent facts. Fill it from the official PEGI/IGRS
   list when someone owns that.
7. **`local_multiplayer` needs human curation.** `0018_game_features.sql` fills it for
   31 of 58 titles, but Wikidata carries splitscreen data for only 3 — the rest came from
   an explicit judgement list in `scripts/gen-game-features.mjs`. This is the field that
   decides whether a group books a console for couch play, and it is the least
   trustworthy data in the repo. Two entries were already corrected during the migration
   (Marvel Rivals and GTA V have no couch play at all). `max_local_players` is null for
   the other 27 rather than guessing a number.
8. **`GM-043 Garfield Lasagna Party` has no publisher.** The one row the harvest could
   not fill. Everything else is 58/58 or 57/58.
9. **`GM-020 Dead Space` is a judgement call.** Wikidata matched the 2023 remake, which
   still has no release date; the migration records the 2008 original (EA Montreal,
   `2008-10-08`). If the lounge actually stocks the remake, change this one row.
10. **Per-page admin content.** The shell, the KPI strips, the snacks stock-movement ledger,
    and real tables on `/admin/bookings` and `/admin/units` all shipped. What is left: green
    eyebrow labels on every admin page, the `AKSICEPAT OPERASIONAL KASIR` shortcut bar, and
    the topbar's branch selector and notification bell, which need pages that can honour
    them first.
11. **Native `<input type="date">` / `datetime-local`.** Same class of problem R3 just
    fixed for selects. The glyph is fine (`color-scheme: dark` already covers it) and the
    heights are now consistent at 48px, so this is only about matching the design's date
    *tiles*.
12. **Admin CRUD** — closed. `/admin/bookings` and `/admin/units` have real tables with
    working search, and every admin route defect in this audit is now covered by
    `tests/admin-harness.ts` (15 route tests, 26 query-builder tests). Add new admin
    routes to that harness as they appear — a route with no test is how the search box
    500'd and "deactivate" deleted an account.
13. ~~**D6** — wire `?type=` / `?slot=` from the instant-booking widget into `/booking`.~~
    **Shipped.** See the note below.
14. ~~**D8** — `/admin/users` promises change-role and deactivate, implements neither.**~~
    Fixed; the actual bug was that "deactivate" deleted the account.
15. **R4 funnel chrome** — step strip on `/tiket` and `/payment`.
16. **D9** — delete `/api/availability` and `/api/admin/booking-config`, or wire them.
17. ~~**`/tiket` polish.**~~ **Countdown, success state and headings shipped. The "tear-off
    treatment" was my own invention — the design has no perforation.** See below.
18. **Notifications.** The customer's phone is captured at booking and still never used.
    This needs a WhatsApp Business API provider, so it is a scope decision, not a task.
19. ~~**Snack and branch imagery.**~~ **Snacks shipped: 12/12.** Branch art was dropped —
    see the note above, because `branches.image_url` has no consumer.
20. **`resolve_customer()` overwrites an existing customer's name.** Found by accident,
    not by reading the design. See the note below — this one needs a decision.
