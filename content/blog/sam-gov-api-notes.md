---
title: "Nine things the SAM.gov Opportunities API does that the docs don't mention"
description: "Undocumented rate limits, a field name with a capital L in the wrong place, timezone offsets across eight zones, and a description field that isn't a description. Notes from building a production integration."
date: 2026-09-08
---

# Nine things the SAM.gov Opportunities API does that the docs don't mention

I built [Bidwren](https://bidwren.com), a daily monitor for federal contract
opportunities, against the SAM.gov Opportunities v2 API. Every item below cost me
time, and none of them are in the published documentation. Several are the kind of
thing that fails silently — you get a plausible-looking result that is wrong.

Endpoint throughout is:

```
GET https://api.sam.gov/opportunities/v2/search
```

---

## 1. The rate limit is undocumented, and it is much lower than you expect

There is no published quota for a personal (non-federal) API key, and nothing on
your SAM.gov account page tells you what it is. In practice it is very low.

My first real ingest issued **four requests** — one paginated search per NAICS code I
was watching, all HTTP 200, returning 144 notices. The next run, 2.7 seconds later,
was throttled. Counting one earlier request I made to verify the key worked, five
successful calls is all I got.

Treat four as a floor rather than a measurement. I only instrumented request logging
as part of this build, so any calls made before that aren't in the count, and I never
established where the ceiling actually sits. The useful takeaway is the order of
magnitude: single digits, not hundreds.

You find out like this:

```json
HTTP 429
{
  "code": "900804",
  "message": "Message throttled out",
  "description": "You have exceeded your quota .You can access API after 2026-Sep-09 00:00:00+0000 UTC",
  "nextAccessTime": "2026-Sep-09 00:00:00+0000 UTC"
}
```

A few things worth extracting. The response is **not** wrapped in an `error` object,
and the quota text is in `description` — `message` is the generic `"Message throttled
out"`, so branching on it tells you nothing useful. There is a dedicated
**`nextAccessTime`** field: branch on that rather than parsing prose, and note the
spacing in `quota .You` is SAM's, not a typo of mine. Reproduced verbatim because
anyone string-matching the description will hit it.

The reset in that message is at **midnight UTC** rather than 24 hours from my first
request, so a quota burned in the morning costs the entire working day. That's a
single observation, not a documented guarantee. The error code `900804` does appear
stable.

Design for this from the first line of code. Cap pagination with a hard maximum page
count rather than looping until the result set is exhausted, and log every outbound
request with its URL, status, and record count. When you get throttled, that log is
the only way to reconstruct what spent the quota.

The practical consequence is bigger than it sounds: you cannot iterate against the
live API. Store the full raw response for every record you ingest, and re-derive your
parsing from stored data instead of refetching. When I later changed my schema and
needed to reprocess 144 notices, that decision turned a day-long block into a
zero-request backfill.

---

## 2. The API key is documented to expire every 90 days

Personal API keys are documented as rolling on a 90-day cycle. I haven't hit an
expiry yet, so I can't tell you what the failure response looks like — but the
failure *mode* it creates is worth designing against in advance.

If your ingestion catches errors and returns an empty array, an expired key looks
exactly like a quiet day with no new notices — and you will not notice for weeks.
Make auth failures throw, return a non-2xx from your handler, and record them
distinctly. A quiet day is HTTP 200 with `totalRecords: 0`. An auth failure is an
exception. Never let the two collapse into the same observable state.

Set a calendar reminder for day 80.

---

## 3. The NAICS parameter is `ncode`, not `naics`

Filtering by NAICS code uses `ncode`:

```
&ncode=541511
```

I found this by reading the `links[].href` self-reference inside an actual response,
not from documentation.

Whether a comma-separated list works is undocumented and I could not verify it. I
issue one paginated search per code and dedupe on `noticeId` in memory.

---

## 4. `responseDeadLine` has a capital L

Not `responseDeadline`. The API spells it:

```json
"responseDeadLine": "2026-09-10T10:00:00+02:00"
```

This is the single most expensive character in the payload. Write the camelCased
version and you read `undefined` — no error, no warning, just a null deadline on
every record. In a tool whose entire purpose is deadline tracking, that is a total
failure that looks like sparse data.

Worth defending structurally rather than with a comment. I define the response type
with no `responseDeadline` key at all, so writing the wrong name is a compile error
under TypeScript's strict mode:

```ts
interface SamNotice {
  responseDeadLine: string | null;   // capital L — matches the API
  // no `responseDeadline` key exists, deliberately
}
```

---

## 5. `description` is a URL, not a description

```json
"description": "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=e1854329..."
```

It points at a second endpoint. Getting actual description text should cost one
additional request per notice, which against the quota in item 1 means you cannot
fetch descriptions during ingestion at any meaningful volume. I deferred this rather
than measuring it, so treat the per-notice cost as the obvious reading rather than
something I confirmed.

Treat it as a separate backfill phase, triggered on demand or for a filtered subset.
Do not make it a dependency of your main ingest path.

---

## 6. There are no dollar values anywhere in the response

No award ceiling, no estimated value, no budget range. The `award` object, when
present at all, carries only:

```json
"award": {
  "date": "2026-09-04",
  "number": "47QTCA21D00CL"
}
```

This is not an omission in the API. Pre-award, the government frequently does not
publish an estimated value at all — vendors are meant to price the work, not the
budget. Sometimes a ceiling appears inside the description text, unstructured and
inconsistent.

So: you cannot build a "contracts over $X" filter, and you cannot show a value
column. If you need dollar figures, they exist post-award in
[USAspending.gov's API](https://api.usaspending.gov), which is a separate service I
have not integrated — it is free and requires no key. Note that award amount there is
typically the ceiling while total obligation is what has actually been committed —
different numbers, and conflating them is a real error.

---

## 7. `active` is the string `"Yes"`, not a boolean

```json
"active": "Yes"
```

`Boolean("No")` is `true`, so a naive cast marks every withdrawn notice as live.
Compare explicitly:

```ts
const isActive = raw.active === "Yes";
```

---

## 8. `active` stays `"Yes"` long after the response deadline passes

This one caused a user-visible bug in my first release.

I filtered the daily digest on `active = true`, reasonably assuming that meant "still
open." It does not. My first digest went out with a notice — `N0040626Q0513` — sitting
under a section heading promising things you can respond to, reading "Response period
closed."

Auditing the whole dataset afterwards, **14 of 144 notices were biddable, still
flagged `active`, and already past their deadline**. Only one had landed in that day's
digest; the rest were waiting to. That number climbs on its own as deadlines pass —
it was 22 the following afternoon — so it is a property of the feed, not a fixed
figure.

`active` reflects whether SAM has withdrawn or archived the notice. It is not a
bid-eligibility signal. If you want open notices, check the deadline yourself:

```sql
active = true
and (response_deadline is null or response_deadline > now())
```

The null case matters — plenty of legitimate open notices carry no deadline at all.
In my dataset that was 30 of 144.

---

## 9. Deadlines carry real timezone offsets, and nearly half are not Eastern

Every deadline in my dataset arrived with an explicit UTC offset. None were naive.
The distribution across 114 notices with deadlines:

| Offset | Notices |     | Offset | Notices |
|--------|---------|-----|--------|---------|
| −04:00 | 60      |     | +09:00 | 3       |
| −05:00 | 29      |     | −08:00 | 3       |
| −07:00 | 11      |     | +02:00 | 2       |
| −06:00 | 4       |     | −10:00 | 2       |

Fifty-four of 114 — **47%** — are not −04:00, spanning Hawaii to Japan. Federal
contracting offices exist worldwide, and each states its deadline in local time.

That 47% treats −04:00 as the Eastern baseline, which is correct for September data:
Eastern is on daylight time, so −05:00 there is Central rather than Eastern. Run the
same query against winter data and the two bands swap meaning. An offset does not
identify a timezone, and this is exactly where that bites.

I stored the instants correctly and then rendered everything in ET, which produced
four deadlines at midnight, 2:00 AM and 4:00 AM. Those are not data errors. One of
them, `W912PF26QA066`, has a raw value of `2026-09-10T10:00:00+02:00` — a perfectly
normal 10:00 AM deadline at a 414th Contracting Support Brigade office serving
Vicenza, Italy, which ET conversion turned into 4:00 AM.

Every source-local time in my dataset but one was a normal business hour; stated times
run from 07:00 to 17:00, with a single outlier at 23:00. The 2 AM readings were
entirely manufactured by the conversion.

Show the office's stated wall time with its offset — "10:00 AM (UTC+2)" — because
that is what appears in the solicitation both parties are reading. Keep countdowns
and sorting running off the stored instant, which is timezone-independent and was
never wrong.

Implementation note: shift the instant by the recorded offset and format in UTC,
rather than mapping offsets to IANA zone names. An offset cannot be resolved back to
a zone unambiguously, and you only need to reproduce the stated wall time. If you do
want to label the common case "ET", compare the notice's offset against the offset
Eastern is on *at that deadline's instant*, not against a fixed set — I shipped the
fixed-set version first and mislabelled 29 Central deadlines as Eastern.

---

## Response shape, for reference

```json
{
  "totalRecords": 27,
  "limit": 1,
  "offset": 0,
  "opportunitiesData": [ /* notices */ ],
  "links": [ { "rel": "self", "href": "..." } ]
}
```

Query dates are `MM/DD/YYYY` on `postedFrom` and `postedTo`. A range spanning more
than a year is documented as rejected; I validate the span client-side and never send
one, so I have not seen the error it returns.

`placeOfPerformance` is nested several levels deep and any level can be missing:

```json
"placeOfPerformance": {
  "city":    { "code": "9832", "name": "Bristow" },
  "state":   { "code": "VA", "name": "Virginia" },
  "zip":     "20136",
  "country": { "code": "USA", "name": "UNITED STATES" }
}
```

Frequently null or absent: `typeOfSetAside`, `typeOfSetAsideDescription`,
`responseDeadLine`, `award`, `additionalInfoLink`. Treat all of them as nullable in
both your schema and your UI. In my sample, 41% had no set-aside and 21% had no
deadline.

`uiLink` is the human-facing sam.gov page. That is what you link users to, not the
API URL.

---

## Notice types are the most useful field in the payload

`type` separates notices you can bid on from notices that are informational:

**Biddable:** `Solicitation`, `Combined Synopsis/Solicitation`, `Presolicitation`

**Informational:** `Sources Sought`, `Award Notice`, `Justification`

Those six are the ones I classify explicitly. There are more, and the most common one
in my feed isn't on either list: `Special Notice` accounted for 31 of 144 notices, or
22%, and falls into an explicit "other" bucket rather than being forced into a list it
doesn't belong to.

Together, `Award Notice` and `Special Notice` were **43%** of everything ingested —
62 of 144. If you are building anything that surfaces opportunities to a human, this
split does more work than any other filter.

Classify unknown values into that "other" bucket rather than dropping them — silently
discarding a notice is the same class of failure as a silent zero-result ingest.

---

*These notes came out of building [Bidwren](https://bidwren.com), a daily digest of
federal contract opportunities for small software vendors. If you are integrating a
government API and want a second pair of eyes, I take contract work.*
