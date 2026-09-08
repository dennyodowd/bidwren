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
      <div className="px-5">
        <TableToolbar
          filter={filter}
          shown={result.rows.length}
          total={result.total}
          savedCount={result.savedCount}
          dismissedCount={result.dismissedCount}
        />
        <NoticeTable notices={result.rows} snapshotLabel={snapshotLabel} />
        <TablePagination filter={filter} total={result.total} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="px-5 py-10 text-[12.5px] text-ink-500">Loading opportunities…</div>
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
