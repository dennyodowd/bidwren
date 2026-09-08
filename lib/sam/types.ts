/**
 * The SAM.gov opportunities/v2/search response shape.
 *
 * Derived strictly from `sample.json` at the repo root, which is a real response.
 * CLAUDE.md is explicit that the sample is more trustworthy than the published docs.
 *
 * Everything SAM omits or nulls in practice is optional here. In sample.json alone,
 * `typeOfSetAside`, `typeOfSetAsideDescription`, `responseDeadLine` and
 * `additionalInfoLink` are all null.
 */

export interface SamLink {
  rel?: string | null;
  href?: string | null;
}

export interface SamOfficeAddress {
  zipcode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  state?: string | null;
}

/** Deeply nested, and any level can be missing. Optional-chain every access. */
export interface SamPlaceOfPerformance {
  city?: { code?: string | null; name?: string | null } | null;
  state?: { code?: string | null; name?: string | null } | null;
  zip?: string | null;
  country?: { code?: string | null; name?: string | null } | null;
}

export interface SamPointOfContact {
  fax?: string | null;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
}

/**
 * Carries a date and a contract number and nothing else.
 *
 * There is no award ceiling, estimated value or budget anywhere in the SAM response.
 * Never add a dollar field here, and never build a price filter or value column on top
 * of it — the API does not carry the data.
 */
export interface SamAward {
  date?: string | null;
  number?: string | null;
}

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  type: string;
  baseType?: string | null;
  /** "YYYY-MM-DD". */
  postedDate: string;
  archiveDate?: string | null;
  archiveType?: string | null;
  /**
   * SAM spells this with a capital L. This is not a typo to fix.
   *
   * There is deliberately no `responseDeadline` key on this interface, so the camelCased
   * spelling is a compile error under `strict` rather than a silent `undefined`. That is
   * a stronger guarantee than a comment, and it is why every consumer must read the
   * payload through this type instead of `any`.
   */
  responseDeadLine?: string | null;
  naicsCode?: string | null;
  naicsCodes?: string[] | null;
  classificationCode?: string | null;
  typeOfSetAside?: string | null;
  typeOfSetAsideDescription?: string | null;
  /** The string "Yes" or "No" — not a boolean. Compare exactly. */
  active?: string | null;
  /** Dot-delimited agency hierarchy, e.g. "DEPT.SUB-AGENCY.OFFICE". */
  fullParentPathName?: string | null;
  fullParentPathCode?: string | null;
  organizationType?: string | null;
  officeAddress?: SamOfficeAddress | null;
  placeOfPerformance?: SamPlaceOfPerformance | null;
  pointOfContact?: SamPointOfContact[] | null;
  award?: SamAward | null;
  /** A URL pointing at /opportunities/v1/noticedesc — not description text. */
  description?: string | null;
  additionalInfoLink?: string | null;
  /** The human-facing sam.gov page. This is what we link users to. */
  uiLink?: string | null;
  links?: SamLink[] | null;
  resourceLinks?: string[] | null;
}

export interface SamSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SamOpportunity[];
  links?: SamLink[] | null;
}

/**
 * One outbound SAM request, recorded for every call.
 *
 * CLAUDE.md requires this because SAM's rate limits are undocumented and assumed low —
 * when we get throttled, these entries are how usage gets reconstructed. Persisted to
 * `ingest_runs.request_log`.
 */
export interface SamRequestLogEntry {
  /** Passed through redactUrl() before being stored or logged. */
  url: string;
  status: number;
  page: number;
  records: number;
  totalRecords: number | null;
  ms: number;
}
