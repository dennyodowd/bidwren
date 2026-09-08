---
title: "Building Bidwren"
description: "A daily digest of US federal contract opportunities for small software vendors. What it does, how it got built, and what broke when real data showed up."
date: 2026-09-08
---

# Building Bidwren

[Bidwren](https://bidwren.com) watches SAM.gov and emails you a short list every
morning of the federal contracts you could actually bid on.

I built it to have something real to point at. It's live, it runs on its own
schedule, and it's been ingesting actual government data since day one. Here's what
it does and what I learned building it.

## The problem

SAM.gov is where every federal contract opportunity gets posted. It's free, it's
public, and it's fine. The trouble is that it serves everyone equally, so a
two-person consultancy watching four NAICS codes does the same work each morning as
a defense prime: open the site, re-run your search, scan a list where a small IT
services solicitation sits between an award announcement and a sources-sought notice,
and work out which of the three you can actually do anything about.

The thing that actually costs money is missing a deadline. Federal response deadlines
are hard cutoffs. A bid submitted a minute late isn't late, it's nothing.

So Bidwren does about ninety seconds of work for you. What's new, what closes soon,
what can you respond to.

## What it does

A scheduled job pulls notices every morning for four NAICS codes and upserts them on
the notice ID. It deliberately re-requests a two-day window rather than one, because
postings trickle in, and re-running a day it already holds is a no-op rather than a
duplicate.

Then it splits them. Solicitations, combined synopses and presolicitations are things
you can bid on. Award notices, sources sought and justifications aren't. That sounds
like a small distinction and it turned out to be the most useful thing in the whole
product. On day one, 43% of what came in was in the second group. Without the split
you're reading a list that's almost half noise.

The email puts biddable notices up top as full cards with deadlines and a link
straight to the notice. Early-stage stuff goes below in a condensed section. The
subject line carries the split, so it reads "14 biddable · 17 early-stage" rather
than just giving you a total that overstates what's there.

There's also a dashboard with filters and per-row triage, so you can dismiss what
you've already looked at and it stays gone.

## Stack

Next.js and TypeScript, Postgres on Neon with Drizzle, Tailwind, deployed on Vercel
with their cron, email through Resend. One repo, one deploy, nothing to babysit.

No auth, no multi-tenancy, no job queue. All three would have been reasonable and
none of them were needed to find out whether the thing worked.

## Three decisions I'd make again

**Keeping the raw JSON.** Every notice stores its original API response in a jsonb
column next to the parsed fields. Feels wasteful right up until you need it.

SAM.gov turned out to have an undocumented rate limit somewhere in the single digits
per day, which I found out by hitting it. Later I changed the schema and needed to
derive a new field across all 144 stored notices. Because the raw payloads were
sitting there, the backfill cost zero API calls. Without them I'd have lost a day
waiting for the quota to reset.

**Failing loudly.** An expired key, a rate limit, and a genuinely quiet morning with
no new postings all look identical if your error handling swallows the exception and
returns an empty array. Zero new notices, no alarm, and a tool that quietly stopped
working weeks ago.

So ingestion throws, returns a non-2xx, and writes an error code to a run log. This
got a real test the next morning. The scheduled job hit the rate limit, failed with
`SAM_RATE_LIMIT` and a 429, recorded why, and stopped after a single request instead
of burning through the rest of the quota. The digest that followed found nothing
pending and skipped instead of sending an empty email.

**Writing run logs to my own database.** Every ingest and every send writes a row
with the trigger, status, counts, error code and full request log. Hosting log
retention is short and you don't control it.

The next morning I needed to confirm the cron had actually fired and authenticated
properly. Two SQL queries answered both, without going near a log viewer.

## What broke when real data arrived

I designed against the API's documented shape and a single real sample response, and
it held up better than I expected. Four things were still wrong in ways that only
showed up at volume.

**Expired notices showed up under "Biddable now."** SAM keeps reporting notices as
`active` well past their deadline. Turns out `active` means "not withdrawn," not
"still open," which I'd assumed. The first digest went out with a notice reading
"Response period closed" sitting under a heading that promised things you could
respond to. Now it checks the deadline directly, and expired notices get marked
processed so they drain out instead of piling up in the queue.

**Half the deadlines were in the wrong timezone.** Every deadline comes with an
explicit UTC offset and 47% of them weren't Eastern. Offsets ranging from Hawaii to
Japan, because federal contracting offices are everywhere. I was rendering all of
them in ET, which produced deadlines at midnight and 2 AM that matched nothing in any
document either party was reading. One was a 10 AM deadline at an Army contracting
office serving Vicenza. Now it shows the office's own stated time with the offset, and
the countdowns keep running off the stored instant, which was correct the whole time.

**The agency name showed up twice on a quarter of the rows.** SAM's agency hierarchy
often repeats the department as its own sub-office, so 33 of 144 rows rendered the
department twice in a row, most often "Veterans Affairs, Department Of". My first fix
blanked the duplicate, which then threw away the real office name sitting in the next
segment down. Second attempt takes the first segment that actually differs, which gets
you "Office of Inspector General" instead of a blank line.

**The email's main button looked disabled.** The design called for a light outline
style. I implemented it faithfully, and in Gmail it sat on a nearly identical
background and read as greyed out. Made it dark with white text. Spec fidelity isn't
worth a call to action that looks broken.

## Accessibility

I ran contrast checks on 23 foreground and background pairs that were actually in
use. Most were fine. Row titles came in at 17.2:1, links at 8.1:1. Three were not.

The worst was one CSS property. Closed and dismissed rows were dimmed with
`opacity: 0.62`, and opacity composites the text together with its background, so
everything degrades at once. The countdown landed at 1.65:1 against a 4.5:1
requirement, on 22% of rows at the time I measured it. That share only grows, since
every deadline that passes moves another row into the dimmed state. I replaced it with
explicit colors per element, so a row can recede without going unreadable.

The table also had no semantics at all. It was CSS Grid divs, which means a screen
reader announces about 400 cells as one undifferentiated blob with no way to know
that "541511" is a NAICS code. It's a real table now with column headers and
`aria-sort`, and the visual layout didn't change because the grid just moved onto the
row element.

Also added labels to the filter dropdowns, a focus ring that's visible against both
light and dark backgrounds, actual sorting on the columns that already looked
sortable, and a card layout below 768px so it works on a phone.

## Links

Live at [bidwren.com](https://bidwren.com).

I also wrote up [the SAM.gov API quirks](https://bidwren.com/blog/sam-gov-api-notes)
I ran into, including the undocumented rate limit and a few fields that fail
silently.

Stack: Next.js, TypeScript, Postgres (Neon), Drizzle, Tailwind, Vercel Cron, Resend.

I build production software fast. Internal tools, API integrations, data pipelines,
and the automation that connects systems which don't talk to each other. Bidwren went
from an empty folder to a live product on its own domain, and I work at that pace on
client projects too.

Available for contract work.
