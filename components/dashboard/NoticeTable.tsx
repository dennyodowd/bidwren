import Link from "next/link";

import type { NoticeCardData } from "@/lib/notices/dto";
import {
  filterHref,
  nextSortDirection,
  type NoticeFilter,
  type SortKey,
} from "@/lib/notices/filter";

import { TABLE_GRID, TABLE_MIN_WIDTH } from "./grid";
import { NoticeRow } from "./NoticeRow";

/** Column definitions. `sort` marks the ones that are genuinely sortable. */
const COLUMNS: { label: string; sort?: SortKey; align?: "right" }[] = [
  { label: "RESPONSE DUE", sort: "deadline" },
  { label: "TITLE", sort: "title" },
  { label: "AGENCY" },
  { label: "NOTICE TYPE" },
  { label: "SET-ASIDE" },
  { label: "NAICS" },
  { label: "POSTED", sort: "posted", align: "right" },
  { label: "TRIAGE", align: "right" },
];

function ariaSort(filter: NoticeFilter, key?: SortKey) {
  if (!key || filter.sort !== key) return undefined;
  return filter.dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

export function NoticeTable({
  notices,
  filter,
  snapshotLabel,
}: {
  notices: NoticeCardData[];
  filter: NoticeFilter;
  snapshotLabel: string | null;
}) {
  const sortLabel =
    filter.sort === "deadline"
      ? "response deadline"
      : filter.sort === "posted"
        ? "posted date"
        : "title";

  return (
    /* Wide content scrolls inside its own container; the page body never scrolls
       sideways. Below md the rows become cards, so the scroller is switched off. */
    <div className="overflow-x-auto border border-line-250 bg-paper-000 max-md:overflow-visible">
      <div style={{ minWidth: TABLE_MIN_WIDTH }} className="max-md:!min-w-0">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Federal contract opportunities matching your filters, sorted by {sortLabel}.
          </caption>

          <thead className="max-md:hidden">
            <tr
              style={{
                gridTemplateColumns: TABLE_GRID,
                // Matches the 3px urgency rail every data row carries, so columns align.
                borderLeft: "3px solid transparent",
              }}
              className="sticky top-0 z-5 grid items-stretch border-b border-line-300 bg-paper-300 px-[14px] font-mono text-[9.5px] tracking-[0.09em] text-ink-500"
            >
              {COLUMNS.map((column) => {
                const active = Boolean(column.sort) && filter.sort === column.sort;
                const arrow = active ? (filter.dir === "asc" ? " ↑" : " ↓") : "";
                return (
                  <th
                    key={column.label}
                    scope="col"
                    aria-sort={ariaSort(filter, column.sort)}
                    className={`py-2 pr-[10px] leading-[1.3] font-normal ${
                      column.align === "right" ? "text-right" : ""
                    } ${active ? "font-semibold text-ink-900" : ""}`}
                  >
                    {column.sort ? (
                      <Link
                        href={filterHref(filter, {
                          sort: column.sort,
                          dir: nextSortDirection(filter, column.sort),
                        })}
                        className="no-underline hover:underline"
                      >
                        {column.label}
                        {arrow}
                        <span className="sr-only">
                          {active
                            ? `, sorted ${filter.dir === "asc" ? "ascending" : "descending"}. Activate to reverse the order.`
                            : ", activate to sort by this column"}
                        </span>
                      </Link>
                    ) : (
                      column.label
                    )}
                    {column.sort === "deadline" && snapshotLabel && (
                      <span className="block font-normal tracking-[0.06em] text-ink-500">
                        AS OF {snapshotLabel}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {notices.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-5 py-[34px] text-center text-[13px] text-ink-500"
                >
                  Nothing matches these filters.{" "}
                  <Link href="/" className="text-signal-link underline">
                    Clear filters
                  </Link>
                </td>
              </tr>
            ) : (
              notices.map((notice, index) => (
                <NoticeRow key={notice.noticeId} notice={notice} index={index} />
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line-200 bg-paper-150 px-6 py-[11px] text-[11.5px] text-ink-500">
          <div>
            Days remaining are counted from the {snapshotLabel ?? "latest"} snapshot, not
            live. Deadline times are shown in the contracting office&rsquo;s own timezone.
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-[7px] w-[7px] rounded-full bg-ink-900"
              />
              Bid-eligible
            </div>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-[7px] w-[7px] rounded-full border-[1.5px] border-line-dot"
              />
              Informational only
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TablePagination({
  filter,
  total,
  pageSize,
}: {
  filter: NoticeFilter;
  total: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-[14px] py-3 text-[12px] text-ink-500"
    >
      <span>
        Page {filter.page} of {totalPages}
      </span>
      <div className="flex gap-3">
        {filter.page > 1 && (
          <Link
            href={filterHref(filter, { page: filter.page - 1 })}
            className="text-signal-link underline"
          >
            ← Previous
          </Link>
        )}
        {filter.page < totalPages && (
          <Link
            href={filterHref(filter, { page: filter.page + 1 })}
            className="text-signal-link underline"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}
