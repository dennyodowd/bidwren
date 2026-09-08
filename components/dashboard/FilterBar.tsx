import Link from "next/link";

import { agencyShortLabel } from "@/lib/notices/agency";
import {
  DEFAULT_POSTED_RANGE,
  filterHref,
  filterToQuery,
  isFilterActive,
  POSTED_RANGES,
  type NoticeFilter,
} from "@/lib/notices/filter";
import { setAsideLabel } from "@/lib/notices/set-aside";
import { ALL_KNOWN_TYPES } from "@/lib/sam/classify";

import { FilterAutoSubmit } from "./FilterAutoSubmit";

const SELECT_CLASS =
  "appearance-none rounded-[4px] border border-line-300 bg-surface-control py-[7px] pr-[26px] pl-[10px] text-[12.5px] font-medium text-ink-900";
const LABEL_CLASS =
  "mb-1.5 font-mono text-[9.5px] tracking-[0.11em] text-ink-500";
/** The design's CSS-drawn chevron, kept as inline style so it stays with the control. */
const CHEVRON: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,transparent 50%,var(--ink-450) 50%),linear-gradient(135deg,var(--ink-450) 50%,transparent 50%)",
  backgroundPosition: "calc(100% - 14px) 14px,calc(100% - 9px) 14px",
  backgroundSize: "5px 5px,5px 5px",
  backgroundRepeat: "no-repeat",
};

const RANGE_LABELS: Record<number, string> = {
  1: "Last 24 hours",
  7: "Last 7 days",
  30: "Last 30 days",
};

export function FilterBar({
  filter,
  countsByType,
  allCount,
  biddableCount,
  newCount,
  closingSoonCount,
  agencies,
  setAsides,
}: {
  filter: NoticeFilter;
  countsByType: Record<string, number>;
  allCount: number;
  biddableCount: number;
  newCount: number;
  closingSoonCount: number;
  agencies: string[];
  setAsides: { code: string; description: string | null }[];
}) {
  /**
   * The segmented control lists All and Bid-eligible, then every known type, then any
   * type actually present in the data that CLAUDE.md doesn't enumerate — "Special Notice"
   * alone was 22% of a real sample, so an unlisted type must never be unreachable.
   */
  const extraTypes = Object.keys(countsByType)
    .filter((type) => !ALL_KNOWN_TYPES.some((known) => known === type))
    .sort();

  const segments: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: allCount },
    { key: "biddable", label: "Bid-eligible", count: biddableCount },
    ...[...ALL_KNOWN_TYPES, ...extraTypes].map((type) => ({
      key: type,
      label: type,
      count: countsByType[type] ?? 0,
    })),
  ];

  // Carried through the GET form so changing a select never drops the other filters.
  const hidden = filterToQuery({ ...filter, agency: null, setAside: null, days: DEFAULT_POSTED_RANGE, page: 1 });

  return (
    <section aria-labelledby="filters-heading" className="border-b border-line-250 bg-paper-000 px-5 pt-4 max-md:px-3 max-md:pt-3">
      <h2 id="filters-heading" className="sr-only">
        Filters
      </h2>
      <div className="mb-3.5 flex flex-wrap items-baseline gap-3.5 max-md:mb-2 max-md:gap-1">
        <h1 className="m-0 text-[19px] font-semibold tracking-[-0.015em]">
          {/* Only "overnight" when the range actually is; otherwise say what is shown. */}
          {filter.days === 1
            ? "Overnight opportunities"
            : `Opportunities from the last ${filter.days} days`}
        </h1>
        <div className="text-[12.5px] text-ink-450">
          <span className="font-semibold text-ink-900">{newCount}</span> new since
          yesterday ·{" "}
          <span className="font-semibold text-ink-900">{closingSoonCount}</span> closing
          within 5 days
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-[26px] pb-3.5 max-md:gap-3 max-md:pb-3">
        <div className="max-md:w-full max-md:min-w-0">
          <div className={LABEL_CLASS} id="notice-type-label">NOTICE TYPE</div>
          <div
            role="group"
            aria-labelledby="notice-type-label"
            className="flex flex-wrap overflow-hidden rounded-[4px] border border-line-300 bg-surface-control max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:rounded-none max-md:border-x-0"
          >
            {segments.map((segment, index) => {
              const active = filter.type === segment.key;
              return (
                <Link
                  key={segment.key}
                  href={filterHref(filter, { type: segment.key })}
                  aria-current={active ? "true" : undefined}
                  style={{
                    borderLeft:
                      index === 0
                        ? "none"
                        : `1px solid ${active ? "transparent" : "var(--line-divider)"}`,
                    background: active ? "var(--ink-900)" : "transparent",
                    color: active ? "var(--paper-000)" : "var(--ink-600)",
                    fontWeight: active ? 600 : 500,
                  }}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-[7px] text-[12.5px] tracking-[-0.005em] no-underline"
                >
                  {segment.label}
                  <span
                    style={{
                      background: active ? "rgba(251,251,249,0.18)" : "var(--paper-300)",
                      color: active ? "var(--paper-000)" : "var(--ink-450)",
                    }}
                    className="rounded-[2px] px-1 py-px font-mono text-[10px] font-medium"
                  >
                    {segment.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* A GET form, so the selects work with JavaScript disabled. */}
        <form method="get" action="/" className="flex flex-wrap items-end gap-2.5 max-md:grid max-md:w-full max-md:grid-cols-2 max-md:items-end max-md:gap-2">
          {Object.entries(hidden).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          <div>
            <label className={LABEL_CLASS} htmlFor="filter-agency">
              AGENCY
            </label>
            <select
              id="filter-agency"
              name="agency"
              defaultValue={filter.agency ?? ""}
              style={CHEVRON}
              className={`${SELECT_CLASS} min-w-[150px] max-md:w-full`}
            >
              <option value="">All agencies</option>
              {agencies.map((agency) => (
                <option key={agency} value={agency}>
                  {agencyShortLabel(agency) ?? agency}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="filter-setAside">
              SET-ASIDE
            </label>
            <select
              id="filter-setAside"
              name="setAside"
              defaultValue={filter.setAside ?? ""}
              style={CHEVRON}
              className={`${SELECT_CLASS} min-w-[160px] max-md:w-full`}
            >
              <option value="">Any set-aside</option>
              {setAsides.map((setAside) => (
                <option key={setAside.code} value={setAside.code}>
                  {setAsideLabel(setAside.code, setAside.description) ?? setAside.code}
                </option>
              ))}
            </select>
          </div>

          <div className="max-md:col-span-2">
            <label className={LABEL_CLASS} htmlFor="filter-days">
              POSTED
            </label>
            <select
              id="filter-days"
              name="days"
              defaultValue={String(filter.days)}
              style={CHEVRON}
              className={`${SELECT_CLASS} min-w-[130px] max-md:w-full`}
            >
              {POSTED_RANGES.map((range) => (
                <option key={range} value={range}>
                  {RANGE_LABELS[range]}
                </option>
              ))}
            </select>
          </div>

          <FilterAutoSubmit />
        </form>

        {isFilterActive(filter) && (
          <div className="ml-auto flex items-center gap-3.5 pb-px">
            <Link
              href="/"
              className="text-[12px] text-ink-450 underline underline-offset-2"
            >
              Clear filters
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
