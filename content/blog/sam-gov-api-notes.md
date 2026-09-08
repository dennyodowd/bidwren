---
title: "Nine things the SAM.gov Opportunities API does that the docs don't mention"
description: "Undocumented rate limits, a field name with a capital L in the wrong place, timezone offsets across eight zones, and a description field that isn't a description. Notes from building a production integration."
date: 2026-09-08
---

# Nine things the SAM.gov Opportunities API does that the docs don't mention

I built [Bidwren](https://bidwren.com), a daily monitor for federal contract
opportunities, on top of the SAM.gov Opportunities v2 API. Everything below cost me
time, and none of it is in the published docs. A few of these fail silently, which is
the worst kind: you get a result that looks fine and isn't.

Endpoint throughout is:

```
GET https://api.sam.gov/opportunities/v2/search
```

---

## 1. The rate limit is undocumented, and much lower than you'd guess

There's no published quota for a personal (non-federal) API key, and nothing on your
SAM.gov account page tells you what yours is. It's low.

My first real ingest made four requests, one paginated search per NAICS code I was
watching. All four returned 200 and pulled back 144 notices. The next run, 2.7 seconds
later, was throttled. Add the one request I'd made earlier to check the key worked and
that's five successful calls, total.

Four is a floor, not a measurement. I only added request logging as part of that
build, so anything I fired off before then isn't counted, and I never did find the
actual ceiling. Treat it as an order of magnitude: single digits, not hundreds.

Here's what you get:

```json
HTTP 429
{
  "code": "900804",
  "message": "Message throttled out",
  "description": "You have exceeded your quota .You can access API after 2026-Sep-09 00:00:00+0000 UTC",
  "nextAccessTime": "2026-Sep-09 00:00:00+0000 UTC"
}
```

Note that it isn't wrapped in an `error` object, and the useful text is in
`description`. The `message` field just says `"Message throttled out"` every time, so
there's nothing to branch on there. Branch on `nextAccessTime` instead. It's a real
field and it saves you parsing prose.

The odd spacing in `quota .You` is SAM's, not mine. I've left it exactly as returned,
because anyone string-matching that description will run into it.

That reset time is midnight UTC rather than 24 hours from my first request, so a quota
you burn at 9am is gone for the rest of the working day. One observation, not a
documented guarantee. The `900804` code does seem stable.

Plan for this before you write anything else. Cap pagination at a fixed number of
pages instead of looping until the result set runs out, and log every outbound request
with its URL, status and record count. Once you're throttled, that log is the only
record of what spent the quota.

The knock-on effect is the real problem: you can't iterate against the live API. Store
the full raw response for every record you ingest and re-derive your parsing from
that. I changed my schema later and had to reprocess all 144 notices, which would have
been a day of waiting. Instead it was a backfill that made zero API calls.

---

## 2. The API key is documented to expire every 90 days

Personal keys are documented as rolling on a 90-day cycle. I haven't hit an expiry
yet, so I can't tell you what the response looks like. The failure mode is still worth
designing around in advance.

If your ingestion catches errors and returns an empty array, an expired key is
indistinguishable from a quiet day with no new notices, and you won't spot it for
weeks. Let auth failures throw. Return a non-2xx from your handler and record them
separately. A quiet day is HTTP 200 with `totalRecords: 0`. An expired key is an
exception. Don't let those two collapse into the same observable state.

Set a calendar reminder for day 80.

---

## 3. The NAICS parameter is `ncode`, not `naics`

Filtering by NAICS code uses `ncode`:

```
&ncode=541511
```

I found that by reading the `links[].href` self-reference inside an actual response,
not from any documentation.

Whether a comma-separated list works is undocumented, and I couldn't verify it either
way. I issue one paginated search per code and dedupe on `noticeId` in memory.

---

## 4. `responseDeadLine` has a capital L

Not `responseDeadline`. The API spells it:

```json
"responseDeadLine": "2026-09-10T10:00:00+02:00"
```

This is the most expensive character in the payload. Write the camelCased version and
you read `undefined`. No error, no warning, just a null deadline on every single
record. In a tool built entirely around deadline tracking, that's a total failure
wearing the costume of sparse data.

A comment won't save you here, so I made it structural. My response type has no
`responseDeadline` key at all, which turns the wrong spelling into a compile error
under TypeScript's strict mode:

```ts
interface SamNotice {
  responseDeadLine: string | null;   // capital L, matches the API
  // there is deliberately no `responseDeadline` key
}
```

---

## 5. `description` is a URL, not a description

```json
"description": "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=e1854329..."
```

It points at a second endpoint. Fetching the actual text should cost one extra request
per notice, and given the quota in item 1, that rules out doing it during ingestion at
any real volume. I deferred it rather than measuring it, so take the per-notice cost as
the obvious reading rather than something I confirmed.

Make it a separate backfill phase, on demand or for a filtered subset. Don't put it on
the critical path of your main ingest.

---

## 6. There are no dollar values anywhere in the response

No award ceiling, no estimated value, no budget range. When the `award` object shows up
at all, this is all of it:

```json
"award": {
  "date": "2026-09-04",
  "number": "47QTCA21D00CL"
}
```

That's not an oversight in the API. Pre-award, the government often doesn't publish an
estimated value, because vendors are supposed to price the work rather than the budget.
A ceiling sometimes turns up inside the description text, unstructured and
inconsistent, which is not something you can build on.

Practically: no "contracts over $X" filter, and no value column. If you need dollar
figures they exist post-award in
[USAspending.gov's API](https://api.usaspending.gov), a separate service I haven't
integrated. It's free and needs no key. One warning if you go there: award amount is
usually the ceiling, while total obligation is what's actually been committed. Those
are different numbers and people conflate them constantly.

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

## 8. `active` stays `"Yes"` long after the deadline passes

This one shipped to users before I caught it.

I'd filtered the daily digest on `active = true`, assuming that meant "still open". It
doesn't. My first digest went out with a notice in it, `N0040626Q0513`, sitting under a
heading that promised things you could respond to, and reading "Response period
closed".

When I went back and audited the whole dataset, 14 of 144 notices were biddable, still
flagged `active`, and already past their deadline. Only that one had made it into the
digest. The rest were queued up to.

That number climbs by itself as deadlines roll past. It was 22 the following afternoon.
So it's a property of the feed rather than a fixed figure, and any number I quote here
is really a timestamp.

What `active` actually means is that SAM hasn't withdrawn or archived the notice. It
says nothing about whether you can still bid. If you want open notices, check the
deadline yourself:

```sql
active = true
and (response_deadline is null or response_deadline > now())
```

Don't drop the null case. Plenty of legitimately open notices carry no deadline at all:
30 of my 144.

---

## 9. Deadlines carry real timezone offsets, and nearly half aren't Eastern

Every deadline in my dataset arrived with an explicit UTC offset. Not one was naive.
Across the 114 notices that had a deadline:

| Offset | Notices |     | Offset | Notices |
|--------|---------|-----|--------|---------|
| −04:00 | 60      |     | +09:00 | 3       |
| −05:00 | 29      |     | −08:00 | 3       |
| −07:00 | 11      |     | +02:00 | 2       |
| −06:00 | 4       |     | −10:00 | 2       |

Fifty-four of 114, about 47%, are something other than −04:00. The spread runs from
Hawaii to Japan. Federal contracting offices are all over the world and each one states
its deadline in local time.

That 47% treats −04:00 as the Eastern baseline, which is right for September data,
since Eastern is on daylight time and −05:00 there means Central. Run the same query
against January data and those two rows change meaning entirely. An offset doesn't
identify a timezone, and this is exactly where that gets you.

I stored the instants correctly and then rendered everything in ET, which gave me four
deadlines sitting at midnight, 2am and 4am. None of those were data errors. One of
them, `W912PF26QA066`, has a raw value of `2026-09-10T10:00:00+02:00`: an entirely
ordinary 10am deadline at a 414th Contracting Support Brigade office serving Vicenza,
Italy. ET conversion turned it into 4am.

Every source-local time in my dataset but one was a normal business hour. They run from
07:00 to 17:00, with a single outlier at 23:00. The 2am readings were manufactured
entirely by my own conversion.

So show the office's stated wall time with its offset, like "10:00 AM (UTC+2)". That's
what's printed in the solicitation both parties are reading. Keep your countdowns and
sorting on the stored instant, which is timezone-independent and was never the problem.

Two implementation notes. Shift the instant by the recorded offset and format in UTC,
rather than mapping offsets onto IANA zone names, because an offset can't be resolved
back to a zone unambiguously and all you need is to reproduce the stated wall clock.
And if you want to label the common case "ET", compare the notice's offset against
whatever Eastern is on *at that deadline's instant*, not against a fixed set of
offsets. I shipped the fixed-set version first and mislabelled 29 Central deadlines as
Eastern. The naive version is wrong twice a year, in opposite directions.

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

Query dates are `MM/DD/YYYY` on `postedFrom` and `postedTo`. A range longer than a year
is documented as rejected. I validate the span client-side and never send one, so I've
never seen the error it returns.

`placeOfPerformance` nests several levels deep, and any level can be missing:

```json
"placeOfPerformance": {
  "city":    { "code": "9832", "name": "Bristow" },
  "state":   { "code": "VA", "name": "Virginia" },
  "zip":     "20136",
  "country": { "code": "USA", "name": "UNITED STATES" }
}
```

Frequently null or absent: `typeOfSetAside`, `typeOfSetAsideDescription`,
`responseDeadLine`, `award`, `additionalInfoLink`. Make all of them nullable in your
schema and give every one an empty state in your UI. In my sample, 41% had no set-aside
and 21% had no deadline. Those aren't edge cases.

`uiLink` is the human-facing sam.gov page. Link your users to that, not to the API URL.

---

## Notice types are the most useful field in the payload

`type` separates the notices you can bid on from the ones that are informational:

**Biddable:** `Solicitation`, `Combined Synopsis/Solicitation`, `Presolicitation`

**Informational:** `Sources Sought`, `Award Notice`, `Justification`

Those six are the ones I classify explicitly. There are more, and the most common type
in my whole feed isn't on either list. `Special Notice` accounted for 31 of 144
notices, 22% of everything, and it lands in an explicit "other" bucket rather than
getting forced into a list where it doesn't belong.

Between them, `Award Notice` and `Special Notice` made up 43% of everything I ingested,
62 notices out of 144. If you're building anything that puts opportunities in front of
a human, this single field does more useful work than any other filter you can apply.

Put unknown values in that "other" bucket rather than dropping them. Quietly discarding
a notice is the same class of bug as a silent zero-result ingest, and just as hard to
notice.

---

*These notes came out of building [Bidwren](https://bidwren.com), a daily digest of
federal contract opportunities for small software vendors. If you're integrating a
government API and want a second pair of eyes, I take contract work.*
