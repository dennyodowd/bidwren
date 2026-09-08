import { and, count, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import { ingestRuns, noticeStates, notices } from "@/db/schema";
import { ORGANIZATION_ID } from "@/lib/users/current";

import { toNoticeCardData, type NoticeCardData } from "./dto";
import { PAGE_SIZE, type NoticeFilter } from "./filter";
import { CLOSING_SOON_HOURS } from "./urgency";

export interface NoticeListResult {
  rows: NoticeCardData[];
  /** Rows matching the full filter, before pagination. */
  total: number;
  /** Rows matching every filter except notice type — drives the segmented control. */
  countsByType: Record<string, number>;
  biddableCount: number;
  allCount: number;
  newCount: number;
  closingSoonCount: number;
  dismissedCount: number;
  savedCount: number;
}

/**
 * The design's "RESPONSE DUE ↑" sort, corrected for real data.
 *
 * A plain `response_deadline asc nulls last` looks right against the mockup's sample,
 * which contains no expired notices — but real data does. In a 144-record sample, 31 had
 * already closed, which would have filled the entire first page with dead rows.
 *
 * So the sort runs in three bands: live deadlines soonest-first, then notices SAM gave
 * no deadline for (still actionable, ~21% of the feed), then closed ones last.
 */
const DEADLINE_ORDER = sql`
  case
    when ${notices.responseDeadline} is null then 1
    when ${notices.responseDeadline} < now() or not ${notices.active} then 2
    else 0
  end asc,
  ${notices.responseDeadline} asc nulls last
`;

/**
 * The same three bands with the live deadlines reversed.
 *
 * Only the deadline ordering flips — no-deadline and closed notices stay in bands 2 and
 * 3, because "reverse the sort" should not promote expired notices to the top.
 */
const DEADLINE_ORDER_DESC = sql`
  case
    when ${notices.responseDeadline} is null then 1
    when ${notices.responseDeadline} < now() or not ${notices.active} then 2
    else 0
  end asc,
  ${notices.responseDeadline} desc nulls last
`;

/**
 * Maps the sort filter onto an ORDER BY.
 *
 * The `deadline` case reuses DEADLINE_ORDER verbatim rather than rebuilding it. That
 * expression is load-bearing: a plain `response_deadline asc nulls last` looks right in
 * any test with fresh data and matches the mockup, but buries every live notice beneath
 * the expired ones — the exact bug that shipped in V1.
 */
function orderFor(filter: NoticeFilter): SQL[] {
  const direction = filter.dir === "desc" ? sql`desc` : sql`asc`;

  switch (filter.sort) {
    case "posted":
      return [sql`${notices.postedDate} ${direction}`, DEADLINE_ORDER];
    case "title":
      return [sql`lower(${notices.title}) ${direction}`, DEADLINE_ORDER];
    case "deadline":
    default:
      // Reversing shows the furthest-out live deadlines first, keeping the bands intact.
      return filter.dir === "desc"
        ? [DEADLINE_ORDER_DESC, sql`${notices.postedDate} desc`]
        : [DEADLINE_ORDER, sql`${notices.postedDate} desc`];
  }
}

/** Conditions shared by the list and the counts, excluding the notice-type filter. */
function baseConditions(filter: NoticeFilter): SQL[] {
  const conditions: SQL[] = [eq(notices.organizationId, ORGANIZATION_ID)];

  // `days` is a posted-date window; posted_date is a calendar date, so compare as one.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (filter.days - 1));
  conditions.push(gte(notices.postedDate, since.toISOString().slice(0, 10)));

  if (filter.agency) conditions.push(eq(notices.agencyTop, filter.agency));
  if (filter.setAside) conditions.push(eq(notices.typeOfSetAside, filter.setAside));

  return conditions;
}

function typeCondition(filter: NoticeFilter): SQL | undefined {
  if (filter.type === "all") return undefined;
  if (filter.type === "biddable") return eq(notices.track, "biddable");
  return eq(notices.type, filter.type);
}

/**
 * Lists notices for the dashboard.
 *
 * Sorted by response deadline ascending with nulls last, matching the design's
 * "RESPONSE DUE ↑" column. Nulls-last matters: about a fifth of real notices have no
 * deadline, and they belong at the bottom rather than the top.
 */
export async function listNotices(
  filter: NoticeFilter,
  userId: string,
): Promise<NoticeListResult> {
  const db = getDb();
  const now = new Date();

  // Triage lives in a separate table, so it is a left join: no row means untouched.
  const triageJoin = and(
    eq(noticeStates.organizationId, notices.organizationId),
    eq(noticeStates.noticeId, notices.noticeId),
    eq(noticeStates.userId, userId),
  );

  const conditions = baseConditions(filter);
  const type = typeCondition(filter);
  if (type) conditions.push(type);

  // Dismissed rows stay hidden until explicitly shown or restored.
  if (!filter.showDismissed) {
    conditions.push(
      or(isNull(noticeStates.dismissed), eq(noticeStates.dismissed, false))!,
    );
  }
  if (filter.savedOnly) conditions.push(eq(noticeStates.saved, true));

  const where = and(...conditions);

  const rowsPromise = db
    .select({ notice: notices, state: noticeStates })
    .from(notices)
    .leftJoin(noticeStates, triageJoin)
    .where(where)
    .orderBy(...orderFor(filter))
    .limit(PAGE_SIZE)
    .offset((filter.page - 1) * PAGE_SIZE);

  const totalPromise = db
    .select({ value: count() })
    .from(notices)
    .leftJoin(noticeStates, triageJoin)
    .where(where);

  // Counts for the segmented control use every filter EXCEPT type, so each badge shows
  // what clicking that tab would actually return.
  const countConditions = baseConditions(filter);
  if (!filter.showDismissed) {
    countConditions.push(
      or(isNull(noticeStates.dismissed), eq(noticeStates.dismissed, false))!,
    );
  }
  if (filter.savedOnly) countConditions.push(eq(noticeStates.saved, true));

  const countsPromise = db
    .select({
      type: notices.type,
      track: notices.track,
      value: count(),
    })
    .from(notices)
    .leftJoin(noticeStates, triageJoin)
    .where(and(...countConditions))
    .groupBy(notices.type, notices.track);

  // Toolbar chips ignore the saved/dismissed filters — they are how you reach them.
  const chipConditions = baseConditions(filter);
  const chipsPromise = db
    .select({
      saved: sql<number>`count(*) filter (where ${noticeStates.saved})`,
      dismissed: sql<number>`count(*) filter (where ${noticeStates.dismissed})`,
    })
    .from(notices)
    .leftJoin(noticeStates, triageJoin)
    .where(and(...chipConditions));

  const [rawRows, [totalRow], countRows, [chips]] = await Promise.all([
    rowsPromise,
    totalPromise,
    countsPromise,
    chipsPromise,
  ]);

  const countsByType: Record<string, number> = {};
  let biddableCount = 0;
  let allCount = 0;
  for (const row of countRows) {
    countsByType[row.type] = (countsByType[row.type] ?? 0) + row.value;
    allCount += row.value;
    if (row.track === "biddable") biddableCount += row.value;
  }

  const rows = rawRows.map((row) =>
    toNoticeCardData(row.notice, row.state ?? undefined, now),
  );

  return {
    rows,
    total: totalRow?.value ?? 0,
    countsByType,
    biddableCount,
    allCount,
    newCount: rows.filter((row) => row.isNew).length,
    closingSoonCount: rows.filter((row) => row.isClosingSoon).length,
    savedCount: Number(chips?.saved ?? 0),
    dismissedCount: Number(chips?.dismissed ?? 0),
  };
}

/**
 * Header summary counts, computed across all held notices rather than the current page.
 *
 * `closingSoon` uses the 5-day threshold the design's header states, which is wider than
 * the 72-hour threshold that drives a row's urgency styling.
 */
export async function getHeaderSummary() {
  const db = getDb();
  const [row] = await db
    .select({
      newCount: sql<number>`count(*) filter (where ${notices.firstSeenAt} > now() - interval '24 hours')`,
      closingSoonCount: sql<number>`count(*) filter (
        where ${notices.responseDeadline} is not null
          and ${notices.active}
          and ${notices.responseDeadline} between now() and now() + (${CLOSING_SOON_HOURS} * interval '1 hour')
      )`,
    })
    .from(notices)
    .where(eq(notices.organizationId, ORGANIZATION_ID));

  return {
    newCount: Number(row?.newCount ?? 0),
    closingSoonCount: Number(row?.closingSoonCount ?? 0),
  };
}

/**
 * Powers the header's "Snapshot taken …" line and its status dot.
 *
 * Freshness is computed in SQL rather than from `Date.now()` in the component: the
 * database already knows the current time, and calling an impure function during render
 * is exactly what React's purity rule forbids.
 */
export async function getLastSuccessfulIngest() {
  const db = getDb();
  const [run] = await db
    .select({
      finishedAt: ingestRuns.finishedAt,
      recordsSeen: ingestRuns.recordsSeen,
      isFresh: sql<boolean>`${ingestRuns.finishedAt} > now() - interval '24 hours'`,
    })
    .from(ingestRuns)
    .where(
      and(eq(ingestRuns.organizationId, ORGANIZATION_ID), eq(ingestRuns.status, "success")),
    )
    .orderBy(desc(ingestRuns.startedAt))
    .limit(1);
  return run ?? null;
}

/** Upper bound on one digest, so a backlog cannot produce an unsendable email. */
export const DIGEST_LIMIT = 200;

/**
 * Notices that have not yet gone out in a digest.
 *
 * Pending-based rather than date-based on purpose: if an ingest ran late or a digest
 * failed, nothing is silently skipped — it simply goes out next time. It also means
 * re-running after a success returns nothing, which is what makes the digest idempotent.
 */
export async function getPendingDigestNotices(now: Date = new Date()) {
  const db = getDb();
  const rows = await db
    .select()
    .from(notices)
    .where(
      and(
        eq(notices.organizationId, ORGANIZATION_ID),
        isNull(notices.digestSentAt),
        eq(notices.active, true),
        /**
         * SAM leaves `active: true` on notices whose response date has passed, so the
         * active flag alone let closed notices into the "BIDDABLE NOW" section — a
         * heading that promises you can still respond.
         *
         * A null deadline still qualifies: those are legitimately open, not expired.
         */
        sql`(${notices.responseDeadline} is null or ${notices.responseDeadline} > now())`,
      ),
    )
    .orderBy(sql`(${notices.track} = 'biddable') desc`, DEADLINE_ORDER)
    .limit(DIGEST_LIMIT);

  return rows.map((notice) => toNoticeCardData(notice, undefined, now));
}

/**
 * Marks notices whose deadline has already passed as digested, without sending them.
 *
 * `getPendingDigestNotices` now excludes expired notices, so without this they would sit
 * in the pending queue forever, re-evaluated on every run and never drained. Returns the
 * count so the route can report it.
 */
export async function markExpiredNoticesDigested(): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(notices)
    .set({ digestSentAt: new Date() })
    .where(
      and(
        eq(notices.organizationId, ORGANIZATION_ID),
        isNull(notices.digestSentAt),
        sql`${notices.responseDeadline} is not null and ${notices.responseDeadline} <= now()`,
      ),
    )
    .returning({ noticeId: notices.noticeId });
  return rows.length;
}

/** Marks a digest's notices as sent. Runs only after the send succeeds. */
export async function markNoticesDigested(noticeIds: string[]): Promise<void> {
  if (noticeIds.length === 0) return;
  const db = getDb();
  await db
    .update(notices)
    .set({ digestSentAt: new Date() })
    .where(
      and(eq(notices.organizationId, ORGANIZATION_ID), inArray(notices.noticeId, noticeIds)),
    );
}

/**
 * Whether a recent ingest succeeded.
 *
 * A digest built on a broken ingest is exactly the silent-quiet-day failure the whole
 * design guards against, so the route refuses to send without one.
 */
export async function hasRecentSuccessfulIngest(withinHours: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(ingestRuns)
    .where(
      and(
        eq(ingestRuns.organizationId, ORGANIZATION_ID),
        eq(ingestRuns.status, "success"),
        sql`${ingestRuns.finishedAt} > now() - (${withinHours} * interval '1 hour')`,
      ),
    );
  return (row?.value ?? 0) > 0;
}

/** Distinct agencies and set-asides present in the data, for the filter dropdowns. */
export async function getFilterOptions() {
  const db = getDb();
  const [agencies, setAsides] = await Promise.all([
    db
      .selectDistinct({ value: notices.agencyTop })
      .from(notices)
      .where(and(eq(notices.organizationId, ORGANIZATION_ID), sql`${notices.agencyTop} is not null`))
      .orderBy(notices.agencyTop),
    db
      .selectDistinct({
        value: notices.typeOfSetAside,
        description: notices.typeOfSetAsideDescription,
      })
      .from(notices)
      .where(
        and(
          eq(notices.organizationId, ORGANIZATION_ID),
          sql`${notices.typeOfSetAside} is not null`,
          sql`${notices.typeOfSetAside} <> ''`,
          sql`${notices.typeOfSetAside} <> 'NONE'`,
        ),
      )
      .orderBy(notices.typeOfSetAside),
  ]);

  return {
    agencies: agencies.map((a) => a.value!).filter(Boolean),
    setAsides: setAsides
      .filter((s) => s.value)
      .map((s) => ({ code: s.value!, description: s.description })),
  };
}
