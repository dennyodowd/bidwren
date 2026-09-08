import type { NoticeCardData } from "@/lib/notices/dto";

import { TABLE_GRID } from "./grid";
import { TriageButtons } from "./TriageButtons";

/**
 * One row of the opportunities table.
 *
 * Urgency is encoded three ways at once — colour, weight/size, and the left rule — so it
 * never depends on colour alone. Per the design tokens: under 72 hours is rust with a
 * dark rule, 72–168 hours takes a muted rule, beyond that no rule.
 */

/** Left rule colour by urgency tier. Dismissed and deadline-less rows get none. */
function railColor(notice: NoticeCardData): string {
  if (notice.isDismissed) return "transparent";
  if (notice.urgencyTier === "critical") return "var(--ink-900)";
  if (notice.urgencyTier === "soon") return "var(--signal-mute)";
  return "transparent";
}

function countdownColor(notice: NoticeCardData): string {
  if (notice.deadlineState === "closed" || notice.deadlineState === "none") {
    return "var(--ink-350)";
  }
  return notice.urgencyTier === "critical" ? "var(--signal-critical)" : "var(--ink-900)";
}

function barColor(tier: NoticeCardData["urgencyTier"]): string {
  if (tier === "critical") return "var(--signal-critical)";
  if (tier === "soon") return "var(--ink-600)";
  return "var(--signal-mute)";
}

export function NoticeRow({ notice, index }: { notice: NoticeCardData; index: number }) {
  const isCritical = notice.urgencyTier === "critical";
  /**
   * Fading marks a row as no longer actionable. A closed deadline qualifies; a *missing*
   * one does not — roughly a fifth of real notices never carry a deadline, and fading
   * them would misrepresent the informational feed as dead.
   */
  const faded = notice.deadlineState === "closed" || notice.isDismissed;

  return (
    <div
      style={{
        gridTemplateColumns: TABLE_GRID,
        borderLeft: `3px solid ${railColor(notice)}`,
        background: faded
          ? "var(--paper-050)"
          : index % 2
            ? "var(--paper-100)"
            : "var(--paper-000)",
        opacity: faded ? 0.62 : 1,
      }}
      className="grid min-h-[46px] items-center border-b border-line-100 px-[14px] py-1.5"
    >
      {/* Response due — countdown, date, and depletion bar */}
      <div className="flex flex-col justify-center gap-[3px] self-stretch border-r border-line-100 pr-[10px]">
        <div className="flex items-baseline gap-1.5">
          <span
            className="tabular font-mono tracking-[-0.02em]"
            style={{
              color: countdownColor(notice),
              fontSize: isCritical ? "16px" : "14px",
              fontWeight: isCritical ? 700 : 500,
            }}
          >
            {notice.countdownLabel}
          </span>
          {notice.deadlineLabel && notice.deadlineState === "open" && (
            <span className="font-mono text-[10.5px] text-ink-500">
              {notice.deadlineLabel}
            </span>
          )}
        </div>
        <div className="h-[3px] w-[92px] overflow-hidden bg-line-200">
          <div
            className="h-[3px]"
            style={{
              width: `${notice.barPercent}%`,
              background: barColor(notice.urgencyTier),
            }}
          />
        </div>
      </div>

      {/* Title and solicitation number */}
      <div className="min-w-0 px-3">
        <div
          title={notice.title}
          className="overflow-hidden text-[13.5px] leading-[1.3] tracking-[-0.005em] text-ellipsis whitespace-nowrap"
          style={{
            fontWeight: notice.isSaved ? 600 : 500,
            textDecoration: notice.isDismissed ? "line-through" : "none",
          }}
        >
          {notice.uiLink ? (
            <a href={notice.uiLink} target="_blank" rel="noopener noreferrer">
              {notice.title}
            </a>
          ) : (
            notice.title
          )}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-ink-500">
          {notice.solicitationNumber ?? "—"}
        </div>
      </div>

      {/* Agency over office */}
      <div className="min-w-0 px-[10px] leading-[1.3]" title={notice.agencyFull ?? undefined}>
        <div className="text-[12px] font-semibold tracking-[0.01em] text-ink-700">
          {notice.agencyShort ?? "—"}
        </div>
        <div className="overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-ink-500">
          {notice.agencyOffice ?? ""}
        </div>
      </div>

      {/* Notice type — filled dot for bid-eligible, hollow ring for informational */}
      <div className="flex min-w-0 items-center gap-[7px] px-[10px]">
        <span
          aria-hidden
          className="h-[7px] w-[7px] flex-none rounded-full"
          style={
            notice.isBiddable
              ? { background: "var(--ink-900)" }
              : { border: "1.5px solid var(--line-dot)" }
          }
        />
        <span
          className="min-w-0 text-[11.5px] leading-[1.25]"
          style={{
            fontWeight: notice.isBiddable ? 600 : 400,
            color: notice.isBiddable ? "var(--ink-900)" : "var(--ink-500)",
          }}
        >
          {notice.type}
        </span>
      </div>

      {/* Set-aside — absent on ~41% of real notices, so an empty state is the norm */}
      <div className="min-w-0 px-[10px]">
        {notice.setAside ? (
          <span
            title={notice.setAsideFull ?? undefined}
            className="inline-block max-w-full overflow-hidden rounded-[3px] border border-line-300 bg-paper-150 px-1.5 py-0.5 text-[11px] font-medium text-ellipsis whitespace-nowrap text-ink-700"
          >
            {notice.setAside}
          </span>
        ) : (
          <span className="text-[11px] text-ink-350">—</span>
        )}
      </div>

      <div className="px-2 font-mono text-[11.5px] text-ink-600">
        {notice.naicsCode ?? "—"}
      </div>

      <div className="px-2 text-right font-mono text-[11px] text-ink-500">
        {notice.postedLabel}
      </div>

      <TriageButtons notice={notice} />
    </div>
  );
}
