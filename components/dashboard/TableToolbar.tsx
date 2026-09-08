import Link from "next/link";

import { restoreAllNotices } from "@/lib/notices/actions";
import { filterHref, type NoticeFilter } from "@/lib/notices/filter";

const CHIP_BASE =
  "flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-[9px] py-1 text-[12px] font-medium no-underline";

function chipClass(active: boolean): string {
  return active
    ? `${CHIP_BASE} border-ink-900 bg-ink-900 text-paper-000`
    : `${CHIP_BASE} border-line-300 bg-paper-000 text-ink-600`;
}

function countClass(active: boolean): string {
  return active
    ? "rounded-[2px] bg-paper-000/20 px-1 py-px font-mono text-[10px] text-paper-000"
    : "rounded-[2px] bg-paper-300 px-1 py-px font-mono text-[10px] text-ink-450";
}

/** Row count, the saved and dismissed toggles, and bulk restore. */
export function TableToolbar({
  filter,
  shown,
  total,
  page,
  pageSize,
  savedCount,
  dismissedCount,
}: {
  filter: NoticeFilter;
  shown: number;
  total: number;
  page: number;
  pageSize: number;
  savedCount: number;
  dismissedCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border border-b-0 border-line-250 bg-paper-250 px-3.5 py-2 text-[12px] text-ink-600">
      {/* "50 of 144 shown" read as a filter result when it was really page 1 of 3. */}
      <div className="font-mono text-[11.5px] whitespace-nowrap">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            Showing{" "}
            <span className="font-semibold text-ink-900">
              {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + shown}
            </span>{" "}
            of {total}
          </>
        )}
      </div>
      <span className="h-3.5 w-px bg-line-300" />

      <Link
        href={filterHref(filter, { savedOnly: !filter.savedOnly })}
        className={chipClass(filter.savedOnly)}
      >
        ★ Saved only <span className={countClass(filter.savedOnly)}>{savedCount}</span>
      </Link>

      <Link
        href={filterHref(filter, { showDismissed: !filter.showDismissed })}
        className={chipClass(filter.showDismissed)}
      >
        {filter.showDismissed ? "Hide dismissed" : "Show dismissed"}{" "}
        <span className={countClass(filter.showDismissed)}>{dismissedCount}</span>
      </Link>

      {dismissedCount > 0 && (
        <form action={restoreAllNotices}>
          <button
            type="submit"
            className="cursor-pointer border-none bg-transparent p-0 text-[12px] whitespace-nowrap text-signal-link underline underline-offset-2"
          >
            Restore all
          </button>
        </form>
      )}

      <div className="ml-auto text-[11.5px] whitespace-nowrap text-ink-500">
        Dismissed rows stay hidden until you restore them.
      </div>
    </div>
  );
}
