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

**`active` is the string `"Yes"`/`"No"`, not a boolean.**

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

## Not yet built

Nothing product-specific exists yet: no `lib/`, no `db/`, no schema, no
`drizzle.config.ts`, no route handlers. `app/` is still the create-next-app template.
`resend` is not yet in `package.json`.
