import type { Notice } from "@/db/schema";
import type { Track } from "@/lib/sam/classify";
import { isBiddable } from "@/lib/sam/classify";

import { agencyFullLabel, agencyOfficeLabel, agencyShortLabel } from "./agency";
import { setAsideLabel, setAsideTitle } from "./set-aside";
import { computeUrgency, isClosingSoon, type DeadlineState, type UrgencyTier } from "./urgency";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Minutes of offset for US Eastern, so we can label the common case "ET" not "UTC-4". */
const EASTERN_OFFSETS = new Set(["-04:00", "-05:00"]);

/** "-04:00" → -240 minutes. Null for an unparseable or absent offset. */
function offsetToMinutes(offset: string | null): number | null {
  if (!offset) return null;
  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

/**
 * Formats an instant at the offset the contracting office stated it in.
 *
 * 47% of real deadlines are not Eastern — the feed spans UTC-10 to UTC+9 — so rendering
 * everything in ET turns a 10:00 AM Wiesbaden deadline into "4:00 AM ET". We shift the
 * instant by the recorded offset and format in UTC rather than mapping the offset back to
 * an IANA zone, because an offset does not identify a zone unambiguously and we only need
 * to reproduce the stated wall clock.
 *
 * Falls back to UTC when no offset was captured, which is honest about not knowing.
 */
function formatAtOffset(
  instant: Date,
  offsetMinutes: number | null,
  opts: Intl.DateTimeFormatOptions,
): string {
  const shifted = new Date(instant.getTime() + (offsetMinutes ?? 0) * 60_000);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(shifted);
}

/** "ET" for Eastern, otherwise "UTC+2" / "UTC-7". Null when the offset is unknown. */
function zoneLabel(offset: string | null): string | null {
  if (!offset) return null;
  if (EASTERN_OFFSETS.has(offset)) return "ET";
  const minutes = offsetToMinutes(offset);
  if (minutes === null) return null;
  if (minutes === 0) return "UTC";
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
}

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
  /** Full deadline for the email, e.g. "Sep 8, 2026 · 10:00 AM (UTC+2)". */
  deadlineLongLabel: string | null;
  /** The clock the deadline is stated in: "ET", "UTC+2", or null if unknown. */
  deadlineZoneLabel: string | null;
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
  // Display only — the instant, and therefore every countdown, is unaffected.
  const offsetMinutes = offsetToMinutes(notice.responseDeadlineOffset);
  const zone = zoneLabel(notice.responseDeadlineOffset);

  return {
    noticeId: notice.noticeId,
    title: notice.title,
    solicitationNumber: notice.solicitationNumber,
    type: notice.type,
    track: notice.track,
    isBiddable: isBiddable(notice.type),

    agencyShort: agencyShortLabel(notice.agencyTop),
    agencyOffice: agencyOfficeLabel(notice.agencyOffice, notice.agencyTop),
    agencyFull: agencyFullLabel(notice.fullParentPathName),

    postedDate: notice.postedDate,
    postedLabel: formatDateString(notice.postedDate),
    deadlineLabel: deadline
      ? formatAtOffset(deadline, offsetMinutes, { month: "short", day: "numeric" })
      : null,
    deadlineLongLabel: deadline
      ? `${formatAtOffset(deadline, offsetMinutes, { month: "short", day: "numeric", year: "numeric" })} · ` +
        `${formatAtOffset(deadline, offsetMinutes, { hour: "numeric", minute: "2-digit" })}` +
        `${zone ? ` (${zone})` : ""}`
      : null,
    deadlineZoneLabel: zone,
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
