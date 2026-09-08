/**
 * Agency display names.
 *
 * SAM gives a dot-delimited, all-caps hierarchy and no abbreviation anywhere:
 *   "HOMELAND SECURITY, DEPARTMENT OF.TRANSPORTATION SECURITY ADMINISTRATION.…"
 *
 * The design's agency column is 156px and shows a short code over an office sub-line, so
 * the long form has to be shortened. The map covers the agencies that actually dominate
 * our four NAICS codes; anything unmapped falls back to a title-cased form rather than
 * rendering blank.
 */

/** Keyed on the top-level path segment exactly as SAM writes it. */
const AGENCY_ABBREVIATIONS: Record<string, string> = {
  "DEPT OF DEFENSE": "DoD",
  "DEPARTMENT OF DEFENSE": "DoD",
  "VETERANS AFFAIRS, DEPARTMENT OF": "VA",
  "HEALTH AND HUMAN SERVICES, DEPARTMENT OF": "HHS",
  "GENERAL SERVICES ADMINISTRATION": "GSA",
  "HOMELAND SECURITY, DEPARTMENT OF": "DHS",
  "INTERIOR, DEPARTMENT OF THE": "DOI",
  "COMMERCE, DEPARTMENT OF": "DOC",
  "ENERGY, DEPARTMENT OF": "DOE",
  "JUSTICE, DEPARTMENT OF": "DOJ",
  "TRANSPORTATION, DEPARTMENT OF": "DOT",
  "TREASURY, DEPARTMENT OF THE": "Treasury",
  "AGRICULTURE, DEPARTMENT OF": "USDA",
  "EDUCATION, DEPARTMENT OF": "ED",
  "LABOR, DEPARTMENT OF": "DOL",
  "STATE, DEPARTMENT OF": "State",
  "HOUSING AND URBAN DEVELOPMENT, DEPARTMENT OF": "HUD",
  "ENVIRONMENTAL PROTECTION AGENCY": "EPA",
  "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION": "NASA",
  "SOCIAL SECURITY ADMINISTRATION": "SSA",
  "SMALL BUSINESS ADMINISTRATION": "SBA",
  "NUCLEAR REGULATORY COMMISSION": "NRC",
  "NATIONAL SCIENCE FOUNDATION": "NSF",
  "OFFICE OF PERSONNEL MANAGEMENT": "OPM",
};

const MINOR_WORDS = new Set(["of", "the", "and", "for", "in", "on", "to", "a", "an"]);

/**
 * Acronyms that must survive title-casing.
 *
 * SAM writes everything in capitals, so an acronym is shape-indistinguishable from a
 * short word — "OIG" and "AIR" are both three all-caps letters. A length heuristic
 * therefore mangles either the acronyms or the words, so this is an explicit list.
 * Anything unlisted falls through to title case, which is the safe default.
 */
const KNOWN_ACRONYMS = new Set([
  "NASA", "USDA", "OIG", "ASA", "US", "USA", "VA", "DHS", "DOD", "HHS", "GSA", "EPA",
  "FBI", "CDC", "NIH", "FDA", "TSA", "CBP", "ICE", "FEMA", "CISA", "USCIS", "IRS",
  "SSA", "NSF", "NRC", "DOE", "DOI", "DOJ", "DOT", "HUD", "OPM", "SBA", "NOAA", "FAA",
  "USACE", "DISA", "DLA", "DCSA", "DTRA", "NGA", "NSA", "USAF", "USMC", "USCG", "VISN",
  "IT", "HR", "RD", "OCONUS", "CONUS",
]);

/**
 * True for tokens that keep their original casing: known acronyms, and anything with a
 * digit (office codes such as "36C10M" or "257-NETWORK").
 */
function isAcronym(token: string): boolean {
  const letters = token.replace(/[^A-Za-z0-9]/g, "");
  if (!letters) return false;
  if (/\d/.test(letters)) return true;
  return KNOWN_ACRONYMS.has(letters.toUpperCase()) && letters === letters.toUpperCase();
}

/** Title-cases an all-caps agency string, leaving acronyms and office codes alone. */
export function titleCaseAgency(value: string): string {
  return value
    .split(/(\s+|[-/])/)
    .map((token, index) => {
      if (!/[A-Za-z]/.test(token)) return token;
      if (isAcronym(token)) return token;
      const lower = token.toLowerCase();
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Short label for the agency column — a mapped abbreviation, or a trimmed title case. */
export function agencyShortLabel(agencyTop: string | null | undefined): string | null {
  const raw = agencyTop?.trim();
  if (!raw) return null;

  const mapped = AGENCY_ABBREVIATIONS[raw.toUpperCase()];
  if (mapped) return mapped;

  // Unmapped: drop the trailing ", DEPARTMENT OF"-style suffix, which carries no signal.
  const withoutSuffix = raw.replace(/,\s*(DEPARTMENT|DEPT)\s+OF(\s+THE)?$/i, "");
  return titleCaseAgency(withoutSuffix);
}

/**
 * The office sub-line beneath the agency.
 *
 * Returns null when the office adds nothing: 23% of real notices repeat the agency as
 * its own second path segment ("ENERGY, DEPARTMENT OF.ENERGY, DEPARTMENT OF"), and 5%
 * have a single-segment path with no office at all. Rendering the same string twice, or
 * an empty second line, is worse than showing the agency once.
 */
export function agencyOfficeLabel(
  agencyOffice: string | null | undefined,
  agencyTop?: string | null,
): string | null {
  const raw = agencyOffice?.trim();
  if (!raw) return null;
  if (agencyTop && raw.toUpperCase() === agencyTop.trim().toUpperCase()) return null;
  return titleCaseAgency(raw);
}

/** Full dotted hierarchy, readable — shown on hover. */
export function agencyFullLabel(fullParentPathName: string | null | undefined): string | null {
  const raw = fullParentPathName?.trim();
  if (!raw) return null;
  return raw
    .split(".")
    .map((segment) => titleCaseAgency(segment.trim()))
    .filter(Boolean)
    .join(" — ");
}
