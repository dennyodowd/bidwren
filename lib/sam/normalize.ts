import type { NewNotice } from "@/db/schema";
import { log } from "@/lib/logger";

import { classifyTrack } from "./classify";
import type { SamOpportunity } from "./types";

/** Splits the dot-delimited agency hierarchy into its top level and immediate office. */
function splitAgencyPath(path: string | null | undefined) {
  const segments = (path ?? "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return {
    agencyTop: segments[0] ?? null,
    agencyOffice: segments[1] ?? null,
  };
}

/** Parses SAM's deadline, tolerating malformed values rather than failing a whole page. */
function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Maps a raw SAM notice onto a database row.
 *
 * Returns null rather than throwing when the notice is unusable, so one bad record can
 * never abort a page. The caller counts nulls as skipped and logs them.
 */
export function normalizeNotice(
  opportunity: SamOpportunity,
  organizationId = "default",
): NewNotice | null {
  // These four are NOT NULL in the schema; without them there is no row to write.
  const missing = (["noticeId", "title", "type", "postedDate"] as const).filter(
    (field) => !opportunity[field],
  );
  if (missing.length > 0) {
    log.warn("sam.normalize.skipped", {
      missing,
      noticeId: opportunity.noticeId ?? null,
    });
    return null;
  }

  const { agencyTop, agencyOffice } = splitAgencyPath(opportunity.fullParentPathName);
  const place = opportunity.placeOfPerformance;

  return {
    organizationId,
    noticeId: opportunity.noticeId,

    title: opportunity.title,
    solicitationNumber: opportunity.solicitationNumber ?? null,
    type: opportunity.type,
    baseType: opportunity.baseType ?? null,
    track: classifyTrack(opportunity.type),

    postedDate: opportunity.postedDate,
    archiveDate: opportunity.archiveDate ?? null,
    archiveType: opportunity.archiveType ?? null,
    // Read via the capital-L spelling SAM actually uses.
    responseDeadline: parseDeadline(opportunity.responseDeadLine),

    naicsCode: opportunity.naicsCode ?? null,
    naicsCodes:
      opportunity.naicsCodes ?? (opportunity.naicsCode ? [opportunity.naicsCode] : []),
    classificationCode: opportunity.classificationCode ?? null,

    typeOfSetAside: opportunity.typeOfSetAside ?? null,
    typeOfSetAsideDescription: opportunity.typeOfSetAsideDescription ?? null,

    // Exact string compare: Boolean("No") is true, which would mark every archived
    // notice active.
    active: opportunity.active === "Yes",

    fullParentPathName: opportunity.fullParentPathName ?? null,
    fullParentPathCode: opportunity.fullParentPathCode ?? null,
    agencyTop,
    agencyOffice,
    organizationType: opportunity.organizationType ?? null,

    officeAddress: opportunity.officeAddress ?? null,
    placeOfPerformance: place ?? null,
    // Every level of placeOfPerformance is optional, so chain all the way down.
    popCity: place?.city?.name ?? null,
    popState: place?.state?.code ?? place?.state?.name ?? null,
    popCountry: place?.country?.code ?? place?.country?.name ?? null,

    pointOfContact: opportunity.pointOfContact ?? null,
    award: opportunity.award ?? null,
    links: opportunity.links ?? null,
    resourceLinks: opportunity.resourceLinks ?? null,

    // `description` is a URL. Fetching the text behind it is a separate backfill phase.
    descriptionUrl: opportunity.description ?? null,
    additionalInfoLink: opportunity.additionalInfoLink ?? null,
    uiLink: opportunity.uiLink ?? null,

    raw: opportunity,
  };
}
