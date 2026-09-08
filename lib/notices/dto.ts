import type { Notice } from "@/db/schema";
import type { Track } from "@/lib/sam/classify";
import { isBiddable } from "@/lib/sam/classify";

import { agencyFullLabel, agencyOfficeLabel, agencyShortLabel } from "./agency";
import { setAsideLabel, setAsideTitle } from "./set-aside";
import { computeUrgency, isClosingSoon, type DeadlineState, type UrgencyTier } from "./urgency";

/** The product's timezone: SAM deadlines close at 5:00 PM ET. */
const DISPLAY_TIMEZONE = "America/New_York";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Formats a plain "YYYY-MM-DD" date string without timezone conversion.
 *
 * `postedDate` is a calendar date, not an instant. Passing it through a timezone-aware
 * formatter would parse it as UTC midnight and render the previous day in Eastern time.
 */
function formatDateString(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${MONTHS[month - 1]} ${day}`;
}

/** Formats a real instant in the product's timezone. */
function formatInstant(value: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIMEZONE, ...opts }).format(value);
}

/**
 * Everything the presentational layer needs, flat and pre-formatted.
 *
 * No nested objects, no Date instances, no drizzle row types, no database imports — so
 * the dashboard components and the email renderer can both be rewritten from the design
 * files without touching queries, and neither can re-derive a classification.
 *
 * Nullability here is honest about real data: in a 144-record sample, 41% had no
 * set-aside and 21% had no deadline. Every nullable field needs an empty state.
 */
export interface NoticeCardData {
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  /** Raw SAM type, always displayable, e.g. "Combined Synopsis/Solicitation". */
  type: string;
  track: Track;
  /** Precomputed so the classifier never leaks into JSX or drifts from the digest. */
  isBiddable: boolean;

  agencyShort: string | null;
  agencyOffice: string | null;
  agencyFull: string | null;

  postedDate: string;
  postedLabel: string;
  /** Deadline calendar date, e.g. "Sep 8". Null when SAM gave none. */
  deadlineLabel: string | null;
  /** Full deadline for the email, e.g. "Sep 8, 2026 · 5:00 PM ET". */
  deadlineLongLabel: string | null;
  /** "26h", "14d", "CLOSED", or "—". */
  countdownLabel: string;
  urgencyTier: UrgencyTier;
  deadlineState: DeadlineState;
  hoursRemaining: number | null;
  barPercent: number;
  isClosingSoon: boolean;

  naicsCode: string | null;
  setAside: string | null;
  setAsideFull: string | null;
  placeOfPerformance: string | null;

  uiLink: string | null;
  active: boolean;
  isNew: boolean;

  isSaved: boolean;
  isDismissed: boolean;
}

export interface TriageState {
  saved: boolean;
  dismissed: boolean;
}

/** Joins city and state only when both are present, so no stray commas appear. */
function formatPlace(city: string | null, state: string | null): string | null {
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
}

export function toNoticeCardData(
  notice: Notice,
  triage: TriageState | undefined,
  now: Date = new Date(),
): NoticeCardData {
  const urgency = computeUrgency(notice.responseDeadline, notice.active, now);
  const deadline = notice.responseDeadline;

  return {
    noticeId: notice.noticeId,
    title: notice.title,
    solicitationNumber: notice.solicitationNumber,
    type: notice.type,
    track: notice.track,
    isBiddable: isBiddable(notice.type),

    agencyShort: agencyShortLabel(notice.agencyTop),
    agencyOffice: agencyOfficeLabel(notice.agencyOffice),
    agencyFull: agencyFullLabel(notice.fullParentPathName),

    postedDate: notice.postedDate,
    postedLabel: formatDateString(notice.postedDate),
    deadlineLabel: deadline
      ? formatInstant(deadline, { month: "short", day: "numeric" })
      : null,
    deadlineLongLabel: deadline
      ? `${formatInstant(deadline, { month: "short", day: "numeric", year: "numeric" })} · ${formatInstant(deadline, { hour: "numeric", minute: "2-digit" })} ET`
      : null,
    countdownLabel: urgency.countdownLabel,
    urgencyTier: urgency.tier,
    deadlineState: urgency.state,
    hoursRemaining: urgency.hoursRemaining,
    barPercent: urgency.barPercent,
    isClosingSoon: isClosingSoon(urgency),

    naicsCode: notice.naicsCode,
    setAside: setAsideLabel(notice.typeOfSetAside, notice.typeOfSetAsideDescription),
    setAsideFull: setAsideTitle(notice.typeOfSetAside, notice.typeOfSetAsideDescription),
    placeOfPerformance: formatPlace(notice.popCity, notice.popState),

    uiLink: notice.uiLink,
    active: notice.active,
    // "New since yesterday" in the dashboard header.
    isNew: now.getTime() - notice.firstSeenAt.getTime() < 24 * 3_600_000,

    isSaved: triage?.saved ?? false,
    isDismissed: triage?.dismissed ?? false,
  };
}
