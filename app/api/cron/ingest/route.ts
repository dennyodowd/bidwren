import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { ingestRuns, notices, type NewNotice } from "@/db/schema";
import { authorizeCron, unauthorized } from "@/lib/cron-auth";
import { log } from "@/lib/logger";
import {
  isValidSamDate,
  MAX_RANGE_DAYS,
  samErrorCode,
  samRangeDays,
  searchByNaics,
  TARGET_NAICS,
  windowForDays,
} from "@/lib/sam/client";
import { normalizeNotice } from "@/lib/sam/normalize";
import type { SamOpportunity, SamRequestLogEntry } from "@/lib/sam/types";

/**
 * Vercel cron entrypoint, also callable manually with ?secret= per CLAUDE.md.
 *
 * Segment config is deliberately just this one line:
 *  - no `runtime` export — 'nodejs' is the default and 'edge' is deprecated in Next 16
 *  - no `dynamic` export — Route Handlers are not cached by default since Next 15
 * Both omissions contradict pre-16 cron boilerplate and are intentional.
 */
export const maxDuration = 60;

const ORGANIZATION_ID = "default";

/** Neon's HTTP endpoint has a payload ceiling; upserts go up in batches of this size. */
const UPSERT_CHUNK_SIZE = 200;

/**
 * Columns refreshed when a notice we already hold arrives again.
 *
 * Two deliberate omissions:
 *  - `firstSeenAt` and `digestSentAt` are never touched, which is what makes a re-run a
 *    true no-op. Resetting digestSentAt would re-email every notice on the next digest.
 *  - `descriptionText` / `descriptionFetchedAt` are owned by the later backfill phase.
 *    Setting them from `excluded` would wipe fetched description text on every re-ingest.
 *
 * `excluded.*` references the DATABASE column name, not the TypeScript key. A wrong name
 * here is a runtime SQL error rather than a type error, so each one is spelled out.
 */
const UPSERT_SET = {
  title: sql`excluded.title`,
  solicitationNumber: sql`excluded.solicitation_number`,
  type: sql`excluded.type`,
  baseType: sql`excluded.base_type`,
  track: sql`excluded.track`,
  postedDate: sql`excluded.posted_date`,
  archiveDate: sql`excluded.archive_date`,
  archiveType: sql`excluded.archive_type`,
  responseDeadline: sql`excluded.response_deadline`,
  responseDeadlineOffset: sql`excluded.response_deadline_offset`,
  naicsCode: sql`excluded.naics_code`,
  naicsCodes: sql`excluded.naics_codes`,
  classificationCode: sql`excluded.classification_code`,
  typeOfSetAside: sql`excluded.type_of_set_aside`,
  typeOfSetAsideDescription: sql`excluded.type_of_set_aside_description`,
  active: sql`excluded.active`,
  fullParentPathName: sql`excluded.full_parent_path_name`,
  fullParentPathCode: sql`excluded.full_parent_path_code`,
  agencyTop: sql`excluded.agency_top`,
  agencyOffice: sql`excluded.agency_office`,
  organizationType: sql`excluded.organization_type`,
  officeAddress: sql`excluded.office_address`,
  placeOfPerformance: sql`excluded.place_of_performance`,
  popCity: sql`excluded.pop_city`,
  popState: sql`excluded.pop_state`,
  popCountry: sql`excluded.pop_country`,
  pointOfContact: sql`excluded.point_of_contact`,
  award: sql`excluded.award`,
  links: sql`excluded.links`,
  resourceLinks: sql`excluded.resource_links`,
  descriptionUrl: sql`excluded.description_url`,
  additionalInfoLink: sql`excluded.additional_info_link`,
  uiLink: sql`excluded.ui_link`,
  raw: sql`excluded.raw`,
  lastSeenAt: sql`now()`,
} as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) return unauthorized();

  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  /**
   * Re-normalise and re-upsert every notice already held, from the stored `raw` payload,
   * making no SAM requests at all.
   *
   * This is what the `raw` column is for: when a parsing bug is fixed or the classifier
   * changes, the fix can be applied to existing data instead of refetching against an
   * API whose quota is small and shared with the daily job.
   */
  const replay = params.get("replay") === "1";

  // Default to two days rather than one: SAM postings trickle in, and re-fetching a day
  // already held is free because the upsert makes it a no-op.
  const daysParam = params.get("days");
  const days = daysParam ? Number(daysParam) : 2;
  if (!Number.isInteger(days) || days < 1) {
    return badRequest("`days` must be a positive integer");
  }

  const fromParam = params.get("from");
  const toParam = params.get("to");
  let postedFrom: string;
  let postedTo: string;

  if (fromParam || toParam) {
    if (!fromParam || !toParam) return badRequest("`from` and `to` must be given together");
    if (!isValidSamDate(fromParam) || !isValidSamDate(toParam)) {
      return badRequest("`from` and `to` must be MM/DD/YYYY");
    }
    postedFrom = fromParam;
    postedTo = toParam;
  } else {
    ({ postedFrom, postedTo } = windowForDays(days));
  }

  // SAM rejects a range spanning more than a year. Catch it here rather than burning a
  // request to be told so.
  const span = samRangeDays(postedFrom, postedTo);
  if (!Number.isFinite(span) || span < 1) return badRequest("`from` must precede `to`");
  if (span > MAX_RANGE_DAYS) {
    return badRequest(`Range spans ${span} days; SAM rejects anything over ${MAX_RANGE_DAYS}`);
  }

  const db = getDb();
  const requestLog: SamRequestLogEntry[] = [];
  const naicsCodes = [...TARGET_NAICS];

  // A dry run touches no tables at all — no ingest_runs row, no upsert.
  let runId: string | null = null;
  if (!dryRun) {
    const [run] = await db
      .insert(ingestRuns)
      .values({
        organizationId: ORGANIZATION_ID,
        trigger: auth.trigger,
        status: "running",
        // A replay sends nothing to SAM, so there is no window to record.
        postedFrom: replay ? "replay" : postedFrom,
        postedTo: replay ? "replay" : postedTo,
        naicsCodes: replay ? [] : naicsCodes,
      })
      .returning({ id: ingestRuns.id });
    // Written before any network call, so a run that times out or OOMs is still visible.
    runId = run.id;
  }

  try {
    const seen = new Map<string, SamOpportunity>();
    let pagesFetched = 0;
    let totalRecordsReported = 0;
    let cappedOut = false;

    if (replay) {
      const stored = await db
        .select({ raw: notices.raw })
        .from(notices)
        .where(eq(notices.organizationId, ORGANIZATION_ID));
      for (const row of stored) {
        if (row.raw?.noticeId) seen.set(row.raw.noticeId, row.raw);
      }
      totalRecordsReported = stored.length;
    } else {
      for (const naics of naicsCodes) {
        const result = await searchByNaics({ naics, postedFrom, postedTo, requestLog });
        pagesFetched += result.pages;
        totalRecordsReported += result.totalRecords;
        cappedOut ||= result.cappedOut;
        // A notice can carry several NAICS codes and appear in more than one search.
        for (const notice of result.notices) {
          if (notice.noticeId) seen.set(notice.noticeId, notice);
        }
      }
    }

    const rows: NewNotice[] = [];
    let recordsSkipped = 0;
    for (const opportunity of seen.values()) {
      const row = normalizeNotice(opportunity, ORGANIZATION_ID);
      if (row) rows.push(row);
      else recordsSkipped += 1;
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        postedFrom,
        postedTo,
        pagesFetched,
        totalRecordsReported,
        cappedOut,
        recordsSeen: seen.size,
        recordsSkipped,
        requestLog,
        notices: rows,
      });
    }

    let recordsInserted = 0;
    let recordsUpdated = 0;

    for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
      const returned = await db
        .insert(notices)
        .values(batch)
        .onConflictDoUpdate({
          target: [notices.organizationId, notices.noticeId],
          set: UPSERT_SET,
        })
        // xmax = 0 distinguishes a fresh insert from an update of an existing row.
        .returning({ inserted: sql<boolean>`xmax = 0` });

      for (const row of returned) {
        if (row.inserted) recordsInserted += 1;
        else recordsUpdated += 1;
      }
    }

    await db
      .update(ingestRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        pagesFetched,
        recordsSeen: seen.size,
        recordsInserted,
        recordsUpdated,
        recordsSkipped,
        totalRecordsReported,
        cappedOut,
        requestLog,
      })
      .where(eq(ingestRuns.id, runId!));

    log.info("ingest.complete", {
      runId,
      recordsSeen: seen.size,
      recordsInserted,
      recordsUpdated,
      recordsSkipped,
      cappedOut,
    });

    return Response.json({
      ok: true,
      runId,
      postedFrom,
      postedTo,
      pagesFetched,
      totalRecordsReported,
      recordsSeen: seen.size,
      recordsInserted,
      recordsUpdated,
      recordsSkipped,
      cappedOut,
    });
  } catch (error) {
    const code = samErrorCode(error);
    const message = error instanceof Error ? error.message : String(error);

    // Caught only to record the failure. The response is still non-2xx, which is what
    // makes Vercel show the cron invocation as failed. A SAM failure must never return
    // 200 with zero records — that is indistinguishable from a genuinely quiet day.
    log.error("ingest.failed", { runId, code, message });

    if (runId) {
      await db
        .update(ingestRuns)
        .set({
          status: "error",
          finishedAt: new Date(),
          errorCode: code,
          errorMessage: message,
          requestLog,
        })
        .where(eq(ingestRuns.id, runId));
    }

    return Response.json({ ok: false, code, message }, { status: 500 });
  }
}
