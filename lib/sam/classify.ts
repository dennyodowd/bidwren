/**
 * The core product distinction, per CLAUDE.md: `type` separates biddable notices from
 * informational ones.
 *
 * This module is the single source of truth for that split. It drives exactly two things,
 * and both must stay consistent with it:
 *   1. the dashboard's primary filter
 *   2. the digest email's two-section split
 *
 * The classification is computed once at ingest and persisted to `notices.track`, so both
 * consumers read one column rather than each re-deriving it.
 */

export const BIDDABLE_TYPES = [
  "Solicitation",
  "Combined Synopsis/Solicitation",
  "Presolicitation",
] as const;

export const INFORMATIONAL_TYPES = [
  "Sources Sought",
  "Award Notice",
  "Justification",
] as const;

export type Track = "biddable" | "informational" | "other";

const BIDDABLE_LOOKUP = new Set<string>(BIDDABLE_TYPES.map((t) => t.toLowerCase()));
const INFORMATIONAL_LOOKUP = new Set<string>(
  INFORMATIONAL_TYPES.map((t) => t.toLowerCase()),
);

/**
 * SAM publishes more types than the six CLAUDE.md names — "Special Notice" and
 * "Sale of Surplus Property" among them.
 *
 * Unknown types classify as "other" and are never dropped: silently discarding a notice
 * is the same class of failure as a silent zero-record ingest. "other" surfaces on the
 * dashboard under the All filter with its raw type shown, and folds into the digest's
 * early-stage section — never the biddable one, because we never imply something is
 * biddable when we don't know that it is.
 */
export function classifyTrack(type: string | null | undefined): Track {
  const normalized = (type ?? "").trim().toLowerCase();
  if (BIDDABLE_LOOKUP.has(normalized)) return "biddable";
  if (INFORMATIONAL_LOOKUP.has(normalized)) return "informational";
  return "other";
}

export function isBiddable(type: string | null | undefined): boolean {
  return classifyTrack(type) === "biddable";
}

/** Every type we know how to name, in the order the dashboard's filter presents them. */
export const ALL_KNOWN_TYPES = [...BIDDABLE_TYPES, ...INFORMATIONAL_TYPES] as const;
