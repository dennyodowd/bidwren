/**
 * Set-aside display labels.
 *
 * SAM returns a short code in `typeOfSetAside` and a long sentence in
 * `typeOfSetAsideDescription` — e.g. "SDVOSBC" alongside "Service-Disabled Veteran-Owned
 * Small Business (SDVOSB) Set-Aside (FAR 19.14)". The design's column is 78px, so neither
 * is directly usable: the code is opaque and the description is far too long.
 *
 * This maps codes onto the short vocabulary the design actually uses — "Total SB",
 * "8(a)", "SDVOSB", "WOSB".
 */

const SET_ASIDE_LABELS: Record<string, string> = {
  SBA: "Total SB",
  SBP: "Partial SB",
  "8A": "8(a)",
  "8AN": "8(a) Sole Source",
  HZC: "HUBZone",
  HZS: "HUBZone SS",
  SDVOSBC: "SDVOSB",
  SDVOSBS: "SDVOSB SS",
  WOSB: "WOSB",
  WOSBSS: "WOSB SS",
  EDWOSB: "EDWOSB",
  EDWOSBSS: "EDWOSB SS",
  LAS: "Local Area",
  IEE: "IEE",
  ISBEE: "ISBEE",
  BICiv: "BI Civilian",
  VSA: "VOSB",
  VSS: "VOSB SS",
};

/**
 * Values that mean "no set-aside applies".
 *
 * Three distinct spellings occur in real data: SQL NULL, the empty string, and the
 * literal code "NONE" ("No Set aside used"). All three render as no tag — an unrestricted
 * solicitation, not a missing value.
 */
const NO_SET_ASIDE = new Set(["", "NONE"]);

export function isNoSetAside(code: string | null | undefined): boolean {
  return !code || NO_SET_ASIDE.has(code.trim().toUpperCase());
}

/**
 * Short label for the set-aside tag, or null when none applies.
 *
 * Falls back to the raw code for unmapped values so a new SBA programme shows something
 * recognisable rather than vanishing from the column.
 */
export function setAsideLabel(
  code: string | null | undefined,
  description?: string | null,
): string | null {
  if (isNoSetAside(code)) return null;

  const normalized = code!.trim();
  const mapped = SET_ASIDE_LABELS[normalized] ?? SET_ASIDE_LABELS[normalized.toUpperCase()];
  if (mapped) return mapped;

  // Unmapped: prefer a short description over an opaque code, but never a long sentence.
  if (description && description.length <= 18) return description;
  return normalized;
}

/** The full description, for the tag's hover title. */
export function setAsideTitle(
  code: string | null | undefined,
  description?: string | null,
): string | null {
  if (isNoSetAside(code)) return null;
  return description?.trim() || code!.trim();
}
