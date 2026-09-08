import { ALL_KNOWN_TYPES } from "@/lib/sam/classify";

/**
 * The dashboard's URL contract, mirroring the design's filter controls.
 *
 * There is deliberately no free-text search — the design has none — and there is no
 * value or price parameter, because the SAM API carries no dollar data at all.
 */

export const POSTED_RANGES = [1, 7, 30] as const;
export type PostedRange = (typeof POSTED_RANGES)[number];

export const DEFAULT_POSTED_RANGE: PostedRange = 30;
export const PAGE_SIZE = 50;

/** "all", "biddable", or one exact SAM type string. */
export type TypeFilter = "all" | "biddable" | string;

/** Columns the table can be ordered by. */
export const SORT_KEYS = ["deadline", "posted", "title"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export const DEFAULT_SORT: SortKey = "deadline";
export const DEFAULT_DIR: SortDirection = "asc";

export interface NoticeFilter {
  type: TypeFilter;
  agency: string | null;
  setAside: string | null;
  days: PostedRange;
  savedOnly: boolean;
  showDismissed: boolean;
  sort: SortKey;
  dir: SortDirection;
  page: number;
}

/** searchParams values can be string[] when a key repeats; take the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseNoticeFilter(
  searchParams: Record<string, string | string[] | undefined>,
): NoticeFilter {
  const rawType = first(searchParams.type)?.trim();
  const type: TypeFilter =
    rawType === "biddable" || (rawType && ALL_KNOWN_TYPES.some((t) => t === rawType))
      ? rawType
      : "all";

  const rawDays = Number(first(searchParams.days));
  const days = POSTED_RANGES.includes(rawDays as PostedRange)
    ? (rawDays as PostedRange)
    : DEFAULT_POSTED_RANGE;

  const rawPage = Number(first(searchParams.page));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSort = first(searchParams.sort);
  const sort = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : DEFAULT_SORT;
  const dir: SortDirection = first(searchParams.dir) === "desc" ? "desc" : "asc";

  return {
    type,
    agency: first(searchParams.agency)?.trim() || null,
    setAside: first(searchParams.setAside)?.trim() || null,
    days,
    savedOnly: first(searchParams.saved) === "1",
    showDismissed: first(searchParams.dismissed) === "1",
    sort,
    dir,
    page,
  };
}

/**
 * Clicking the active column reverses it; clicking a new one starts from its natural
 * direction — soonest deadline and A-Z ascending, most recent posting first.
 */
export function nextSortDirection(filter: NoticeFilter, key: SortKey): SortDirection {
  if (filter.sort === key) return filter.dir === "asc" ? "desc" : "asc";
  return key === "posted" ? "desc" : "asc";
}

export const EMPTY_FILTER: NoticeFilter = {
  type: "all",
  agency: null,
  setAside: null,
  days: DEFAULT_POSTED_RANGE,
  savedOnly: false,
  showDismissed: false,
  sort: DEFAULT_SORT,
  dir: DEFAULT_DIR,
  page: 1,
};

/** Serialises a filter back to a query string, omitting defaults to keep URLs clean. */
export function filterToQuery(filter: NoticeFilter): Record<string, string> {
  const query: Record<string, string> = {};
  if (filter.type !== "all") query.type = filter.type;
  if (filter.agency) query.agency = filter.agency;
  if (filter.setAside) query.setAside = filter.setAside;
  if (filter.days !== DEFAULT_POSTED_RANGE) query.days = String(filter.days);
  if (filter.savedOnly) query.saved = "1";
  if (filter.showDismissed) query.dismissed = "1";
  if (filter.sort !== DEFAULT_SORT) query.sort = filter.sort;
  if (filter.dir !== DEFAULT_DIR) query.dir = filter.dir;
  if (filter.page > 1) query.page = String(filter.page);
  return query;
}

/** Builds a dashboard href with `changes` applied over the current filter. */
export function filterHref(filter: NoticeFilter, changes: Partial<NoticeFilter>): string {
  // Any filter change invalidates the current page number.
  const next = { ...filter, ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams(filterToQuery(next)).toString();
  return query ? `/?${query}` : "/";
}

/** Stable key for the Suspense boundary, so the skeleton reappears on each change. */
export function filterKey(filter: NoticeFilter): string {
  return JSON.stringify(filterToQuery(filter));
}

export function isFilterActive(filter: NoticeFilter): boolean {
  return (
    filter.type !== "all" ||
    filter.agency !== null ||
    filter.setAside !== null ||
    filter.days !== DEFAULT_POSTED_RANGE ||
    filter.savedOnly
  );
}
