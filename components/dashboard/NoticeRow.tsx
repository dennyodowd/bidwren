import type { NoticeCardData } from "@/lib/notices/dto";

import { TABLE_GRID } from "./grid";
import { TriageButtons } from "./TriageButtons";

/**
 * One row of the opportunities table.
 *
 * A real <tr>/<td> so screen readers can associate each value with its column header,
 * with `display: grid` carrying the visual layout. Below the md breakpoint the same
 * markup restyles into a stacked card — semantics are identical at every width.
 *
 * Urgency is encoded three ways at once — colour, weight/size, and the left rule — so it
 * never depends on colour alone. Under 72 hours is rust with a dark rule, 72–168 hours
 * takes a muted rule, beyond that no rule.
 */

/** Left rule colour by urgency tier. Dismissed and deadline-less rows get none. */
function railColor(notice: NoticeCardData): string {
  if (notice.isDismissed) return "transparent";
  if (notice.urgencyTier === "critical") return "var(--ink-900)";
  if (notice.urgencyTier === "soon") return "var(--signal-mute)";
  return "transparent";
}

/**
 * Countdown colour.
 *
 * Closed and dateless rows use ink-500 rather than ink-350: at 5.6:1 it still reads as
 * secondary but clears AA, where ink-350 sat at 2.4:1.
 */
function countdownColor(notice: NoticeCardData): string {
  if (notice.deadlineState === "closed" || notice.deadlineState === "none") {
    return "var(--ink-500)";
  }
  return notice.urgencyTier === "critical" ? "var(--signal-critical)" : "var(--ink-900)";
}

function barColor(tier: NoticeCardData["urgencyTier"]): string {
  if (tier === "critical") return "var(--signal-critical)";
  if (tier === "soon") return "var(--ink-600)";
  return "var(--signal-mute)";
}

/** Mobile label shown before each value when the row collapses into a card. */
function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block w-[74px] shrink-0 font-mono text-[9.5px] tracking-[0.09em] text-ink-500 md:hidden"
    >
      {children}
    </span>
  );
}

const CELL = "min-w-0 px-2.5 max-md:flex max-md:items-baseline max-md:px-0 max-md:py-0.5";

export function NoticeRow({ notice, index }: { notice: NoticeCardData; index: number }) {
  const isCritical = notice.urgencyTier === "critical";
  /**
   * A closed or dismissed row recedes through its background and weight, never through
   * `opacity`: opacity composites text and background together, which dropped every cell
   * in these rows to between 1.6:1 and 3.0:1.
   */
  const receded = notice.deadlineState === "closed" || notice.isDismissed;

  return (
    <tr
      style={{
        gridTemplateColumns: TABLE_GRID,
        borderLeft: `3px solid ${railColor(notice)}`,
        background: receded
          ? "var(--paper-050)"
          : index % 2
            ? "var(--paper-100)"
            : "var(--paper-000)",
      }}
      className="grid min-h-[46px] items-center border-b border-line-100 px-[14px] py-1.5 max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-1 max-md:py-3"
    >
      {/* Response due — countdown, date, and depletion bar */}
      <td className="flex flex-col justify-center gap-[3px] self-stretch border-r border-line-100 pr-[10px] max-md:border-r-0 max-md:pr-0">
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
              {notice.deadlineZoneLabel ? ` ${notice.deadlineZoneLabel}` : ""}
            </span>
          )}
        </div>
        <div className="h-[3px] w-[92px] overflow-hidden bg-line-200 max-md:w-full">
          <div
            className="h-[3px]"
            style={{
              width: `${notice.barPercent}%`,
              background: barColor(notice.urgencyTier),
            }}
          />
        </div>
      </td>

      {/* Title and solicitation number */}
      <td className="min-w-0 px-3 max-md:px-0">
        <div
          title={notice.title}
          className="overflow-hidden text-[13.5px] leading-[1.3] tracking-[-0.005em] text-ellipsis whitespace-nowrap max-md:text-[15px] max-md:whitespace-normal"
          style={{
            fontWeight: notice.isSaved ? 600 : 500,
            textDecoration: notice.isDismissed ? "line-through" : "none",
          }}
        >
          {notice.uiLink ? (
            <a href={notice.uiLink} target="_blank" rel="noopener noreferrer">
              {notice.title}
              <span className="sr-only"> (opens on sam.gov in a new tab)</span>
            </a>
          ) : (
            notice.title
          )}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-ink-500">
          {notice.solicitationNumber ?? "—"}
        </div>
      </td>

      {/* Agency over office */}
      <td className={`${CELL} leading-[1.3]`} title={notice.agencyFull ?? undefined}>
        <CellLabel>AGENCY</CellLabel>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold tracking-[0.01em] text-ink-700">
            {notice.agencyShort ?? "—"}
          </span>
          {/*
            Truncates to one line in the desktop table, but must wrap on mobile: a
            `nowrap` office name such as "Office of Inspector General OIG (36C10M)" sets
            an unbreakable min-content floor, and a `display: table` element is sized to
            max(width, min-content) — so it pushed the whole table past the viewport.
          */}
          <span className="block overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-ink-500 max-md:overflow-visible max-md:whitespace-normal">
            {notice.agencyOffice ?? ""}
          </span>
        </span>
      </td>

      {/* Notice type — filled dot for bid-eligible, hollow ring for informational */}
      <td className={CELL}>
        <CellLabel>TYPE</CellLabel>
        <span className="flex min-w-0 items-center gap-[7px]">
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
        </span>
      </td>

      {/* Set-aside — absent on ~41% of real notices, so an empty state is the norm */}
      <td className={CELL}>
        <CellLabel>SET-ASIDE</CellLabel>
        {notice.setAside ? (
          <span
            title={notice.setAsideFull ?? undefined}
            className="inline-block max-w-full overflow-hidden rounded-[3px] border border-line-300 bg-paper-150 px-1.5 py-0.5 text-[11px] font-medium text-ellipsis whitespace-nowrap text-ink-700"
          >
            {notice.setAside}
          </span>
        ) : (
          <span className="text-[11px] text-ink-450">—</span>
        )}
      </td>

      <td className={`${CELL} font-mono text-[11.5px] text-ink-600`}>
        <CellLabel>NAICS</CellLabel>
        {notice.naicsCode ?? "—"}
      </td>

      <td
        className={`${CELL} text-right font-mono text-[11px] text-ink-500 max-md:text-left`}
      >
        <CellLabel>POSTED</CellLabel>
        {notice.postedLabel}
      </td>

      <td className="max-md:pt-1">
        <TriageButtons notice={notice} />
      </td>
    </tr>
  );
}
