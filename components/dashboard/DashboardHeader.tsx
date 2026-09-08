import type { User } from "@/db/schema";
import { userInitials } from "@/lib/users/current";

/**
 * The dark top bar: wordmark, today's date, ingest freshness, and the current user.
 *
 * "Saved search" is a static label — the design shows it, but no saved-search feature
 * exists and inventing one is out of scope. Everything else is real data.
 */
export function DashboardHeader({
  user,
  snapshotLabel,
  snapshotFresh,
}: {
  user: User;
  snapshotLabel: string | null;
  snapshotFresh: boolean;
}) {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase()
    .replace(/,/g, "");

  return (
    <div className="flex flex-wrap items-stretch justify-between gap-6 bg-ink-900 px-5 text-paper-200 max-md:gap-2">
      <div className="flex items-center gap-[11px] py-[13px]">
        <div
          aria-hidden
          className="h-[15px] w-[15px] rotate-45 bg-paper-200"
          style={{ borderRadius: "2px 6px 2px 6px" }}
        />
        <div className="text-[16px] font-semibold tracking-[-0.01em]">Bidwren</div>
        <div className="h-4 w-px bg-paper-200/30" />
        <div className="font-mono text-[11px] tracking-[0.04em] text-paper-200/60">
          {today}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[18px] py-[13px] text-[12px] max-md:gap-3 max-md:pt-0">
        <div className="flex items-center gap-[7px] text-paper-200/70">
          {/* Decorative — always paired with the text beside it, never colour alone. */}
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: snapshotFresh ? "var(--signal-live)" : "var(--signal-mute)",
            }}
          />
          <span className="font-mono text-[11px]">
            {snapshotLabel ? `Snapshot taken ${snapshotLabel}` : "No successful ingest yet"}
          </span>
        </div>
        <div className="text-paper-200/70">
          Saved search: <span className="font-medium text-paper-200">All watched NAICS</span>
        </div>
        <div
          title={user.email}
          className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-paper-200/15 text-[10px] font-semibold tracking-[0.03em]"
        >
          {userInitials(user)}
        </div>
      </div>
    </div>
  );
}
