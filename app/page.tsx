import { Suspense } from "react";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { NoticeTable, TablePagination } from "@/components/dashboard/NoticeTable";
import { TableToolbar } from "@/components/dashboard/TableToolbar";
import { filterKey, PAGE_SIZE, parseNoticeFilter, type NoticeFilter } from "@/lib/notices/filter";
import {
  getFilterOptions,
  getHeaderSummary,
  getLastSuccessfulIngest,
  listNotices,
} from "@/lib/notices/queries";
import { getCurrentUser } from "@/lib/users/current";

/**
 * Reading searchParams opts this page into request-time rendering on its own, so there
 * is deliberately no `export const dynamic` — that would be dead weight now and would
 * have to be removed if cacheComponents were ever enabled.
 */

function formatSnapshot(finishedAt: Date | null): string | null {
  if (!finishedAt) return null;
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(finishedAt)} ET`;
}

/** Shown when the users table has not been seeded — the expected first-run state. */
function SetupNotice() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-3 text-[19px] font-semibold tracking-[-0.015em]">
        Bidwren needs a user
      </h1>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-600">
        The dashboard resolves the acting user from the <code>users</code> table, and it is
        currently empty. Seed one row to continue — there is no sign-up flow, by design.
      </p>
      <pre className="overflow-x-auto rounded-[3px] border border-line-250 bg-paper-000 p-4 font-mono text-[11.5px] text-ink-700">
        {`insert into users (organization_id, email, name)
values ('default', 'you@example.com', 'Your Name');`}
      </pre>
    </main>
  );
}

async function NoticeSection({
  filter,
  userId,
  snapshotLabel,
}: {
  filter: NoticeFilter;
  userId: string;
  snapshotLabel: string | null;
}) {
  const [result, summary, options] = await Promise.all([
    listNotices(filter, userId),
    getHeaderSummary(),
    getFilterOptions(),
  ]);

  return (
    <>
      <FilterBar
        filter={filter}
        countsByType={result.countsByType}
        allCount={result.allCount}
        biddableCount={result.biddableCount}
        newCount={summary.newCount}
        closingSoonCount={summary.closingSoonCount}
        agencies={options.agencies}
        setAsides={options.setAsides}
      />
      <section aria-labelledby="results-heading" id="results" className="px-5">
        <h2 id="results-heading" className="sr-only">
          Opportunities
        </h2>
        {/* Announces the outcome of a filter, sort or triage change to screen readers. */}
        <p aria-live="polite" className="sr-only">
          {result.total === 0
            ? "No opportunities match these filters."
            : `Showing ${result.rows.length} of ${result.total} opportunities.`}
        </p>
        <TableToolbar
          filter={filter}
          shown={result.rows.length}
          total={result.total}
          page={filter.page}
          pageSize={PAGE_SIZE}
          savedCount={result.savedCount}
          dismissedCount={result.dismissedCount}
        />
        <NoticeTable
          notices={result.rows}
          filter={filter}
          snapshotLabel={snapshotLabel}
        />
        <TablePagination filter={filter} total={result.total} pageSize={PAGE_SIZE} />
      </section>
    </>
  );
}

/**
 * Mirrors the real table's height and rhythm so resolving the Suspense boundary does not
 * shift the page. A bare line of text collapsed the layout and then jumped.
 */
function TableSkeleton() {
  return (
    <div className="px-5 pt-[132px]" aria-hidden>
      <div className="border border-line-250 bg-paper-000">
        <div className="h-[38px] border-b border-line-300 bg-paper-300" />
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-[46px] items-center gap-4 border-b border-line-100 px-[14px]"
            style={{ background: index % 2 ? "var(--paper-100)" : "var(--paper-000)" }}
          >
            <div className="h-3 w-[92px] rounded-[2px] bg-line-200" />
            <div className="h-3 flex-1 rounded-[2px] bg-line-200" />
            <div className="h-3 w-[120px] rounded-[2px] bg-line-200" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading opportunities…</span>
    </div>
  );
}

export default async function Page(props: PageProps<"/">) {
  // searchParams is a Promise in Next 16 and must be awaited.
  const searchParams = await props.searchParams;
  const filter = parseNoticeFilter(searchParams);

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return <SetupNotice />;
  }

  const lastIngest = await getLastSuccessfulIngest();
  const snapshotLabel = formatSnapshot(lastIngest?.finishedAt ?? null);
  const snapshotFresh = lastIngest?.isFresh ?? false;

  return (
    <main className="min-h-screen bg-paper-200 pb-16">
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-[3px] focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-[13px] focus:text-paper-000"
      >
        Skip to opportunities
      </a>
      <DashboardHeader
        user={user}
        snapshotLabel={snapshotLabel}
        snapshotFresh={snapshotFresh}
      />
      {/* Keyed on the filter so the skeleton reappears on every filter change. */}
      <Suspense key={filterKey(filter)} fallback={<TableSkeleton />}>
        <NoticeSection filter={filter} userId={user.id} snapshotLabel={snapshotLabel} />
      </Suspense>
    </main>
  );
}
