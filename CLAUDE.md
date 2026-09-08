@AGENTS.md

# Bidwren

A daily monitor for US federal contract opportunities. It pulls new notices from
SAM.gov each morning, keeps them permanently, and emails a digest of the ones that
match. The users are small government-contracting firms who otherwise check SAM.gov
by hand.

Single-user for now. No auth beyond an env-var password.

## Stack

Next.js App Router (App Router only — `app/` is at the repo root, there is no `src/`),
TypeScript, Tailwind. Postgres on Neon via `drizzle-orm` + `@neondatabase/serverless`,
migrations with `drizzle-kit`. Email via Resend (verified sender domain: `bidwren.com`).
Deploys to Vercel on push to `main`.

Env vars, all in `.env.local` and all read through `process.env` — never inline a
secret, never a fallback literal:

- `DATABASE_URL` — Neon connection string
- `SAM_API_KEY` — SAM.gov API key
- `INGEST_SECRET` — shared secret for manually triggering cron handlers
- `RESEND_API_KEY` — Resend

`AGENTS.md` (imported above) is written by `next dev` and warns that this Next.js
version differs from training data. Take it seriously: read the relevant guide under
`node_modules/next/dist/docs/` before writing route handlers, cron config, or
data-fetching code.

## Data source: SAM.gov

`GET https://api.sam.gov/opportunities/v2/search`, key in `SAM_API_KEY`.

`sample.json` at the repo root is a real response. **Trust it over the published API
docs** — the docs are wrong or incomplete in several places. What we know:

**Envelope.** `{ totalRecords, limit, offset, opportunitiesData: [...], links }`.
The notices are in `opportunitiesData`.

**Query dates are `MM/DD/YYYY`** (`postedFrom`, `postedTo`). A range spanning more
than a year is rejected outright.

**`description` is a URL, not text.** It points at a second endpoint
(`/opportunities/v1/noticedesc?noticeid=...`). Fetching real description text is a
separate backfill phase — do not block ingestion on it.

**There are no dollar values anywhere in the response.** No award ceiling, no
estimated value, no budget. `award` carries only a date and a contract number.
**Never build a price filter, a value column, or a "contracts over $X" feature.**
If one is requested, say the API doesn't carry the data.

**Fields that are frequently `null` or absent:** `typeOfSetAside`,
`typeOfSetAsideDescription`, `responseDeadLine`, `award`, `additionalInfoLink`.
Treat every one of these as nullable in the schema and in the UI. In `sample.json`
all four of the first ones are null.

**`placeOfPerformance` is deeply nested:**
`{ city: { code, name }, state: { code, name }, zip, country: { code, name } }`,
and any level can be missing.

**The API spells it `responseDeadLine`** — capital L. This is not a typo to fix.
Match it exactly when reading the payload; a camelCased `responseDeadline` will
silently read `undefined`.

**`active` is the string `"Yes"`/`"No"`, not a boolean.** It also stays `"Yes"` long
after the response deadline passes — it means "not withdrawn", not "still open". Any
"can I bid on this" query must check the deadline itself.

**Deadlines carry explicit UTC offsets, and 47% are not Eastern.** The live feed spans
UTC-10 to UTC+9, because contracting offices exist worldwide and each states its
deadline in local time. Store the instant *and* the stated offset, render the wall
clock the office actually wrote, and keep countdowns and sorting on the instant.
**An offset does not identify a timezone:** `-05:00` is Eastern in January and Central
in September. To label one, compare against the offset `America/New_York` is on *at
that deadline's instant* — a fixed set of "Eastern offsets" is wrong twice a year in
opposite directions.

**Rate limits are undocumented.** Assume they are low. Cap all pagination with a
hard maximum page count, never loop until exhaustion, and log every outbound request
(URL, status, record count) so we can reconstruct usage when we get throttled.

**The API key expires every 90 days.** Ingestion must fail loudly and visibly on an
auth error rather than logging a warning and recording zero new notices — a silent
zero looks identical to a quiet day.

### Fields on a notice

`noticeId` (our key), `title`, `solicitationNumber`, `type`, `baseType`,
`postedDate`, `archiveDate`, `archiveType`, `responseDeadLine`, `naicsCode`,
`naicsCodes[]`, `classificationCode`, `typeOfSetAside`, `typeOfSetAsideDescription`,
`active`, `fullParentPathName` (dot-delimited agency hierarchy), `fullParentPathCode`,
`organizationType`, `officeAddress`, `placeOfPerformance`, `pointOfContact[]`,
`award`, `description` (URL), `additionalInfoLink`, `uiLink` (the human-facing
sam.gov page — this is what we link users to), `links[]`, `resourceLinks[]`.

## The core product distinction

`type` separates **biddable** notices from **informational** ones:

- **Biddable:** `Solicitation`, `Combined Synopsis/Solicitation`, `Presolicitation`
- **Informational:** `Sources Sought`, `Award Notice`, `Justification`

This single distinction drives two things, and both must stay consistent with it:

1. The dashboard's primary filter — biddable is the default view.
2. The digest email's two-section split — biddable first, informational below.

Target NAICS codes: `541511`, `541512`, `541519`, `541611`.

## Conventions

**Secrets via `process.env`, never inline.** No hardcoded keys, no fallback literals
in code.

**Store the full original JSON in a `raw` jsonb column on every record.** Parsing
bugs are then reprocessable from data we already hold, instead of requiring a refetch
against a rate-limited API.

**Upsert on `noticeId`.** Ingestion reruns constantly — the same notice will arrive
many times, and re-running a day must be a no-op, not a duplicate.

**Every cron handler must also be callable manually** with the secret in the query
string (`?secret=...` checked against `INGEST_SECRET`). Debugging a daily job that
can only be triggered by waiting until tomorrow is not workable.

**Every new table gets an `organizationId` column defaulting to `"default"`.**
Multi-tenancy later then becomes a migration, not a rewrite.

**Pin any figure that came from a time-sensitive query.** Counts that depend on `now()`
drift, and they drift silently, because the number was correct when it was taken. This
has already happened twice: 14 biddable notices were past deadline when audited and 22
the next afternoon; 22% of rows were dimmed at the accessibility audit and 33% a day
later. Both figures were true and both would have been read as current. Record what a
number was measured against, or phrase it so the movement is the point — "at the time I
measured it", not a bare percentage.

**Verify against the layer you are making a claim about.** A screenshot is evidence
about the screenshot; `scrollWidth` is evidence about the layout. Both directions of
this have already cost time here: a `+02:00` deadline was attributed to Wiesbaden from
the solicitation prefix when `placeOfPerformance` plainly said Vicenza, and a
horizontal-overflow bug was diagnosed from a screenshot artefact when the DOM measured
clean. Where a claim is cheap to check directly — read the raw payload, query the
table, measure the element — check it before acting on it. Be as willing to discard a
bug that turns out not to exist as to fix one that does; the instinct to fix engages
before the evidence is in.

## What exists

Deployed at `bidwren.com`, running on a daily Vercel cron.

- `db/` — Drizzle schema and migrations. `notices`, `users`, `notice_states` (per-user
  save/dismiss), `ingest_runs`, `digest_sends`. Neon over `neon-http`, so
  `db.transaction()` throws; use `db.batch()`.
- `lib/sam/` — typed client, classifier, normaliser. `lib/notices/` — filters, queries,
  the `NoticeCardData` DTO that is the seam between data and presentation, urgency
  tiers, agency labels. `lib/email/` — the digest renderer.
- `app/api/cron/{ingest,digest}` — both callable manually with `?secret=`, or by Vercel
  with a `CRON_SECRET` bearer token.
- `app/page.tsx` + `components/dashboard/` — the opportunities table.
- `app/blog/` + `content/blog/` — markdown posts, filename as slug, prerendered.

Env vars beyond the four above: `CRON_SECRET`, `DIGEST_FROM`, `APP_URL`, and
optionally `DATABASE_URL_UNPOOLED` (drizzle-kit only) and `DIGEST_REPLY_TO`.

## Not built yet

- **Auth.** The dashboard is publicly reachable and its triage state is writable by
  anyone with the URL. `lib/users/current.ts` resolves the single enabled user and is
  the one function a password gate would replace — as a root `proxy.ts`, not
  `middleware.ts`, which Next 16 renamed.
- **Description backfill.** `description_text` and `description_fetched_at` exist and
  stay null. Must never become a dependency of ingestion.
- **Saved searches and delivery-time settings.** Referenced in the dashboard chrome and
  the email footer; no feature behind either.
