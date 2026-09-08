import { requireEnv } from "@/lib/env";
import { log, redactUrl } from "@/lib/logger";

import type { SamOpportunity, SamRequestLogEntry, SamSearchResponse } from "./types";

const SAM_SEARCH_URL = "https://api.sam.gov/opportunities/v2/search";

/** Target NAICS codes, per CLAUDE.md. */
export const TARGET_NAICS = ["541511", "541512", "541519", "541611"] as const;

/** Records requested per page. */
export const PAGE_LIMIT = 100;

/**
 * Hard ceiling on pages fetched per NAICS code.
 *
 * SAM's rate limits are undocumented and assumed low, so CLAUDE.md requires that
 * pagination never loops until exhaustion. When this cap is hit with records still
 * outstanding the run is flagged `cappedOut`, which is the signal to narrow the window
 * rather than silently miss notices.
 */
export const MAX_PAGES_PER_NAICS = 10;

/** SAM rejects any range spanning more than a year. */
export const MAX_RANGE_DAYS = 365;

// ---------------------------------------------------------------------------
// Errors
//
// Nothing in the fetch path converts a failure into an empty array. A thrown error
// propagates to the route handler, which returns non-2xx and records the run as failed.
// A quiet day is HTTP 200 with totalRecords: 0 — distinct, and never conflated with this.
// ---------------------------------------------------------------------------

export class SamAuthError extends Error {
  readonly code = "SAM_AUTH";
  constructor(message: string) {
    super(message);
    this.name = "SamAuthError";
  }
}

export class SamRateLimitError extends Error {
  readonly code = "SAM_RATE_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "SamRateLimitError";
  }
}

export class SamRequestError extends Error {
  readonly code = "SAM_REQUEST";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SamRequestError";
  }
}

export function samErrorCode(error: unknown): string {
  if (
    error instanceof SamAuthError ||
    error instanceof SamRateLimitError ||
    error instanceof SamRequestError
  ) {
    return error.code;
  }
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * SAM requires MM/DD/YYYY for postedFrom and postedTo.
 *
 * UTC-based throughout: Vercel runs in UTC but a development machine does not, and a
 * local-time formatter silently queries the wrong day near midnight.
 */
export function formatSamDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

/** Inclusive window ending today (UTC), spanning `days` days. */
export function windowForDays(days: number, now: Date = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { postedFrom: formatSamDate(from), postedTo: formatSamDate(to) };
}

const SAM_DATE_PATTERN = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;

export function isValidSamDate(value: string): boolean {
  return SAM_DATE_PATTERN.test(value);
}

/** Days spanned by an MM/DD/YYYY range, inclusive. NaN if either date is unparseable. */
export function samRangeDays(postedFrom: string, postedTo: string): number {
  const parse = (value: string) => {
    const [month, day, year] = value.split("/").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const from = parse(postedFrom);
  const to = parse(postedTo);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.floor((to - from) / 86_400_000) + 1;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  notices: SamOpportunity[];
  totalRecords: number;
  pages: number;
  cappedOut: boolean;
}

export interface SearchOptions {
  naics: string;
  postedFrom: string;
  postedTo: string;
  /** Appended to for every request, then persisted to ingest_runs.request_log. */
  requestLog: SamRequestLogEntry[];
}

/**
 * Fetches every notice for one NAICS code in the given window, up to the page cap.
 *
 * The NAICS parameter is `ncode`, not `naics` — confirmed from the self-link in
 * sample.json and against the live API. No `ptype` filter is sent: informational notices
 * are stored and digested too, and we classify locally in any case.
 */
export async function searchByNaics({
  naics,
  postedFrom,
  postedTo,
  requestLog,
}: SearchOptions): Promise<SearchResult> {
  const apiKey = requireEnv("SAM_API_KEY");

  const notices: SamOpportunity[] = [];
  let offset = 0;
  let pages = 0;
  let totalRecords = 0;
  let cappedOut = false;

  while (pages < MAX_PAGES_PER_NAICS) {
    const params = new URLSearchParams({
      postedFrom,
      postedTo,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
      ncode: naics,
    });
    const url = `${SAM_SEARCH_URL}?${params}`;
    const startedAt = Date.now();

    /**
     * The key travels as a header so it never reaches a URL, a log line, or a redirect
     * chain. Verified working against the live API.
     */
    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    const ms = Date.now() - startedAt;
    pages += 1;

    if (!response.ok) {
      // Log the failed request before throwing, so it is still reconstructable.
      const entry: SamRequestLogEntry = {
        url: redactUrl(url),
        status: response.status,
        page: pages,
        records: 0,
        totalRecords: null,
        ms,
      };
      requestLog.push(entry);
      log.error("sam.request.failed", { ...entry, naics });

      const body = (await response.text().catch(() => "")).slice(0, 500);

      if (response.status === 401 || response.status === 403) {
        throw new SamAuthError(
          `SAM.gov authentication failed (HTTP ${response.status}). The API key expires ` +
            `every 90 days — check SAM_API_KEY. Response: ${body}`,
        );
      }
      if (response.status === 429) {
        throw new SamRateLimitError(
          `SAM.gov rate limit hit (HTTP 429) after ${pages} page(s). Response: ${body}`,
        );
      }
      throw new SamRequestError(
        `SAM.gov request failed (HTTP ${response.status}). Response: ${body}`,
        response.status,
      );
    }

    const payload = (await response.json()) as SamSearchResponse;
    const batch = payload.opportunitiesData ?? [];
    totalRecords = payload.totalRecords ?? 0;

    const entry: SamRequestLogEntry = {
      url: redactUrl(url),
      status: response.status,
      page: pages,
      records: batch.length,
      totalRecords,
      ms,
    };
    requestLog.push(entry);
    log.info("sam.request", { ...entry, naics });

    notices.push(...batch);
    offset += batch.length;

    // An empty page, or having seen everything the envelope promised, ends the loop.
    if (batch.length === 0 || offset >= totalRecords) break;
  }

  if (pages >= MAX_PAGES_PER_NAICS && offset < totalRecords) {
    cappedOut = true;
    log.warn("sam.capped_out", { naics, pages, offset, totalRecords });
  }

  return { notices, totalRecords, pages, cappedOut };
}
