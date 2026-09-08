/**
 * Deadline urgency, in one place.
 *
 * Nothing else in the app computes a tier — the dashboard row, the summary counts and
 * the digest email all read from here, so the visual encoding cannot drift between them.
 *
 * The design tokens describe four tiers, but its `critical` (<48h) and `urgent` (48–72h)
 * carry identical styling in its own spec, so they collapse into one `critical` tier at
 * <72h. That matches the dashboard mockup's implementation exactly.
 */

/** Whether a deadline exists at all, and whether it has passed. */
export type DeadlineState = "none" | "open" | "closed";

export type UrgencyTier = "critical" | "soon" | "open" | "none" | "closed";

export const CRITICAL_HOURS = 72;
export const SOON_HOURS = 168;
/** Threshold for the "closing within 5 days" summary and the email's urgency flag. */
export const CLOSING_SOON_HOURS = 120;
/** Below this the countdown reads in hours ("26h") rather than days ("14d"). */
export const HOURS_DISPLAY_CUTOFF = 48;
/** Window the depletion bar depletes over: 30 days. */
const BAR_WINDOW_HOURS = 720;

export interface Urgency {
  state: DeadlineState;
  tier: UrgencyTier;
  /** Whole hours until the deadline; negative once passed, null when there is none. */
  hoursRemaining: number | null;
  /** "26h", "14d", "CLOSED", or "—". */
  countdownLabel: string;
  /** Depletion-bar fill, 0–100. Zero when there is no live deadline. */
  barPercent: number;
}

/**
 * A null deadline is NOT the same as a closed one.
 *
 * SAM leaves `responseDeadLine` null constantly — 30 of 144 records in a five-day sample,
 * across Award Notices, Justifications and many Sources Sought. Rendering those as
 * "CLOSED" would misrepresent a fifth of the feed as dead. Genuinely closed means the
 * deadline has passed, or SAM has marked the notice inactive.
 */
export function computeUrgency(
  responseDeadline: Date | string | null | undefined,
  active: boolean,
  now: Date = new Date(),
): Urgency {
  if (!responseDeadline) {
    return {
      state: "none",
      tier: active ? "none" : "closed",
      hoursRemaining: null,
      countdownLabel: active ? "—" : "CLOSED",
      barPercent: 0,
    };
  }

  const deadline =
    responseDeadline instanceof Date ? responseDeadline : new Date(responseDeadline);
  if (Number.isNaN(deadline.getTime())) {
    return {
      state: "none",
      tier: "none",
      hoursRemaining: null,
      countdownLabel: "—",
      barPercent: 0,
    };
  }

  const hoursRemaining = Math.floor((deadline.getTime() - now.getTime()) / 3_600_000);

  if (hoursRemaining < 0 || !active) {
    return {
      state: "closed",
      tier: "closed",
      hoursRemaining,
      countdownLabel: "CLOSED",
      barPercent: 0,
    };
  }

  const tier: UrgencyTier =
    hoursRemaining < CRITICAL_HOURS
      ? "critical"
      : hoursRemaining < SOON_HOURS
        ? "soon"
        : "open";

  return {
    state: "open",
    tier,
    hoursRemaining,
    countdownLabel: formatCountdown(hoursRemaining),
    // Bar fills as the deadline approaches, floored so an imminent one stays visible.
    barPercent: Math.max(4, Math.min(100, 100 - (hoursRemaining / BAR_WINDOW_HOURS) * 100)),
  };
}

/** Hours below the display cutoff, whole days above it. */
export function formatCountdown(hoursRemaining: number): string {
  if (hoursRemaining < HOURS_DISPLAY_CUTOFF) return `${Math.max(0, hoursRemaining)}h`;
  return `${Math.floor(hoursRemaining / 24)}d`;
}

/** Drives the header's "N closing within 5 days". */
export function isClosingSoon(urgency: Urgency): boolean {
  return (
    urgency.state === "open" &&
    urgency.hoursRemaining !== null &&
    urgency.hoursRemaining < CLOSING_SOON_HOURS
  );
}
