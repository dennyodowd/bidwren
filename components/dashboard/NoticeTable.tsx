import Link from "next/link";

import type { NoticeCardData } from "@/lib/notices/dto";
import { filterHref, type NoticeFilter } from "@/lib/notices/filter";

import { TABLE_GRID, TABLE_MIN_WIDTH } from "./grid";
import { NoticeRow } from "./NoticeRow";

const HEADERS = [
  { label: "TITLE", align: "left" },
  { label: "AGENCY", align: "left" },
  { label: "NOTICE TYPE", align: "left" },
  { label: "SET-ASIDE", align: "left" },
  { label: "NAICS", align: "left" },
  { label: "POSTED", align: "right" },
  { label: "TRIAGE", align: "right" },
] as const;

export function NoticeTable({
  notices,
  snapshotLabel,
}: {
  notices: NoticeCardData[];
  snapshotLabel: string | null;
}) {
  return (
    /* Wide content scrolls inside its own container; the page body never scrolls sideways. */
    <div className="overflow-x-auto border border-line-250 bg-paper-000">
      <div style={{ minWidth: TABLE_MIN_WIDTH }}>
        <div
          // Matches the 3px urgency rail every data row carries, so columns line up.
          style={{ gridTemplateColumns: TABLE_GRID, borderLeft: "3px solid transparent" }}
          className="sticky top-0 z-5 grid items-stretch border-b border-line-300 bg-paper-300 px-[14px] font-mono text-[9.5px] tracking-[0.09em] text-ink-500"
        >
          <div className="py-2 pr-[10px] leading-[1.3] font-semibold text-ink-900">
            RESPONSE DUE ↑
            {snapshotLabel && (
              <div className="font-normal tracking-[0.06em] text-ink-500">
                AS OF {snapshotLabel}
              </div>
            )}
          </div>
          {HEADERS.map((header) => (
            <div
              key={header.label}
              className={`py-2 pr-[10px] ${header.align === "right" ? "text-right" : ""}`}
            >
              {header.label}
            </div>
          ))}
        </div>

        {notices.length === 0 ? (
          <div className="px-5 py-[34px] text-center text-[13px] text-ink-500">
            Nothing matches these filters.{" "}
            <Link href="/" className="text-signal-link underline">
              Clear filters
            </Link>
          </div>
        ) : (
          notices.map((notice, index) => (
            <NoticeRow key={notice.noticeId} notice={notice} index={index} />
          ))
        )}

        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line-200 bg-paper-150 px-6 py-[11px] text-[11.5px] text-ink-500">
          <div>
            Days remaining are counted from the {snapshotLabel ?? "latest"} snapshot, not
            live. Deadline times are shown in the contracting office&rsquo;s own timezone.
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-[7px] w-[7px] rounded-full bg-ink-900" />
              Bid-eligible
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-[7px] w-[7px] rounded-full border-[1.5px] border-line-dot" />
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
    <div className="flex items-center justify-between px-[14px] py-3 text-[12px] text-ink-500">
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
    </div>
  );
}
