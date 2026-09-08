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
 * Title-cases an all-caps agency string, leaving short all-caps tokens (acronyms such as
 * GSA or CISA) alone.
 */
export function titleCaseAgency(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((token, index) => {
      if (!/[a-z]/.test(token)) return token;
      if (index > 0 && MINOR_WORDS.has(token)) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
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

/** The office sub-line beneath the agency. */
export function agencyOfficeLabel(agencyOffice: string | null | undefined): string | null {
  const raw = agencyOffice?.trim();
  return raw ? titleCaseAgency(raw) : null;
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
