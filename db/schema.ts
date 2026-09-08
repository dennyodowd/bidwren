import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Track } from "@/lib/sam/classify";
import type {
  SamAward,
  SamLink,
  SamOfficeAddress,
  SamOpportunity,
  SamPlaceOfPerformance,
  SamPointOfContact,
  SamRequestLogEntry,
} from "@/lib/sam/types";

/**
 * Database column names are written out explicitly rather than relying on drizzle-kit's
 * `casing: 'snake_case'`. That option has to be set in both drizzle.config.ts and the
 * runtime drizzle() call, and a mismatch produces queries against columns that do not
 * exist. Explicit names keep one source of truth.
 *
 * Per CLAUDE.md every table carries `organizationId` defaulting to "default", so
 * multi-tenancy later is a migration rather than a rewrite.
 */

const ORG_DEFAULT = "default";

// ---------------------------------------------------------------------------
// notices
// ---------------------------------------------------------------------------

export const notices = pgTable(
  "notices",
  {
    organizationId: text("organization_id").notNull().default(ORG_DEFAULT),
    /** SAM.gov's `noticeId` — our natural key, and what we upsert on. */
    noticeId: text("notice_id").notNull(),

    title: text("title").notNull(),
    solicitationNumber: text("solicitation_number"),
    /** Raw SAM type string, e.g. "Combined Synopsis/Solicitation". */
    type: text("type").notNull(),
    baseType: text("base_type"),
    /**
     * Derived from `type` at ingest and persisted, so the dashboard filter and the
     * digest's section split provably read the same column instead of each re-deriving
     * it. Reclassifying is possible from `raw` without refetching.
     */
    track: text("track").$type<Track>().notNull(),

    /**
     * SAM sends "YYYY-MM-DD". Stored as a string: `mode: "date"` would parse to UTC
     * midnight and render as the previous day in any negative-offset timezone.
     */
    postedDate: date("posted_date", { mode: "string" }).notNull(),
    archiveDate: date("archive_date", { mode: "string" }),
    archiveType: text("archive_type"),
    /**
     * SAM spells the source field `responseDeadLine`, with a capital L. The DB and TS
     * name is normalised here; the API field name is preserved in lib/sam/types.ts.
     * Frequently null — null in sample.json.
     */
    responseDeadline: timestamp("response_deadline", { withTimezone: true }),
    /**
     * The UTC offset the contracting office stated the deadline in, e.g. "-04:00".
     *
     * The instant in `responseDeadline` is unambiguous, but the *wall clock* matters:
     * 47% of real deadlines are not Eastern, and a 10:00 AM Wiesbaden deadline rendered
     * in ET reads as 4:00 AM. Keeping the offset lets us show the time as the office
     * actually stated it. Null whenever there is no deadline.
     */
    responseDeadlineOffset: text("response_deadline_offset"),

    naicsCode: text("naics_code"),
    naicsCodes: jsonb("naics_codes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    classificationCode: text("classification_code"),

    typeOfSetAside: text("type_of_set_aside"),
    typeOfSetAsideDescription: text("type_of_set_aside_description"),

    /** SAM sends the string "Yes"/"No", not a boolean. Converted at normalize time. */
    active: boolean("active").notNull().default(true),

    fullParentPathName: text("full_parent_path_name"),
    fullParentPathCode: text("full_parent_path_code"),
    /** First dot-delimited segment of fullParentPathName — the dashboard's agency cell. */
    agencyTop: text("agency_top"),
    /** Second segment — the office sub-line under the agency. */
    agencyOffice: text("agency_office"),
    organizationType: text("organization_type"),

    officeAddress: jsonb("office_address").$type<SamOfficeAddress>(),
    placeOfPerformance: jsonb("place_of_performance").$type<SamPlaceOfPerformance>(),
    /** Flattened from the nested jsonb, which is awkward to index. Every level optional. */
    popCity: text("pop_city"),
    popState: text("pop_state"),
    popCountry: text("pop_country"),

    pointOfContact: jsonb("point_of_contact").$type<SamPointOfContact[]>(),
    /** Carries only a date and contract number. The API has no dollar values anywhere. */
    award: jsonb("award").$type<SamAward>(),
    links: jsonb("links").$type<SamLink[]>(),
    resourceLinks: jsonb("resource_links").$type<string[]>(),

    /** `description` in the API payload is a URL, not prose. */
    descriptionUrl: text("description_url"),
    /** Populated by a later backfill phase; ingestion must never block on it. */
    descriptionText: text("description_text"),
    descriptionFetchedAt: timestamp("description_fetched_at", { withTimezone: true }),
    additionalInfoLink: text("additional_info_link"),
    /** The human-facing sam.gov page — what we link users to. */
    uiLink: text("ui_link"),

    /**
     * The complete original notice object. Parsing bugs are then reprocessable from data
     * we already hold, instead of requiring a refetch against a rate-limited API.
     */
    raw: jsonb("raw").$type<SamOpportunity>().notNull(),

    /** Drives the dashboard's "new since yesterday" count. Never updated on conflict. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set once the notice has gone out in a digest. Never reset on conflict. */
    digestSentAt: timestamp("digest_sent_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * Composite rather than a bare notice_id PK. CLAUDE.md mandates organizationId on
     * every table *and* upsert on noticeId; a bare notice_id PK would make a second
     * organization a table rewrite. Today organizationId is always "default", so this
     * composite key *is* "upsert on noticeId".
     */
    primaryKey({ columns: [t.organizationId, t.noticeId] }),
    /** The dashboard's default sort: response deadline ascending, nulls last. */
    index("notices_org_deadline_idx").on(t.organizationId, t.responseDeadline),
    index("notices_org_track_posted_idx").on(t.organizationId, t.track, t.postedDate),
    index("notices_org_posted_idx").on(t.organizationId, t.postedDate),
    index("notices_org_type_idx").on(t.organizationId, t.type),
    index("notices_org_naics_idx").on(t.organizationId, t.naicsCode),
    index("notices_org_set_aside_idx").on(t.organizationId, t.typeOfSetAside),
    index("notices_org_agency_idx").on(t.organizationId, t.agencyTop),
    /** Partial index over the digest's hot path — the pending-notice query. */
    index("notices_pending_digest_idx")
      .on(t.organizationId, t.postedDate)
      .where(sql`${t.digestSentAt} is null`),
  ],
);

export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/**
 * Digest recipients and triage owners. Seeded by hand through the Neon UI — there is no
 * management UI in this slice, and no auth: `lib/users/current.ts` resolves the single
 * enabled user. This is where auth fields (password hash, sessions) attach later.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull().default(ORG_DEFAULT),
    email: text("email").notNull(),
    /** Optional display name; drives the header avatar's initials. */
    name: text("name"),
    /** Lets a recipient be paused without deleting the row and losing their triage. */
    digestEnabled: boolean("digest_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_org_email_idx").on(t.organizationId, t.email),
    index("users_org_digest_enabled_idx").on(t.organizationId, t.digestEnabled),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// notice_states
// ---------------------------------------------------------------------------

/**
 * Per-user triage: the dashboard's save (star) and dismiss (cross) actions. A row exists
 * only once a user has acted on a notice, so absence means "untouched".
 */
export const noticeStates = pgTable(
  "notice_states",
  {
    organizationId: text("organization_id").notNull().default(ORG_DEFAULT),
    userId: uuid("user_id").notNull(),
    noticeId: text("notice_id").notNull(),

    saved: boolean("saved").notNull().default(false),
    dismissed: boolean("dismissed").notNull().default(false),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId, t.noticeId] }),
    foreignKey({
      name: "notice_states_user_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notice_states_notice_fk",
      columns: [t.organizationId, t.noticeId],
      foreignColumns: [notices.organizationId, notices.noticeId],
    }).onDelete("cascade"),
    index("notice_states_dismissed_idx").on(t.organizationId, t.userId, t.dismissed),
    index("notice_states_saved_idx").on(t.organizationId, t.userId, t.saved),
  ],
);

export type NoticeState = typeof noticeStates.$inferSelect;
export type NewNoticeState = typeof noticeStates.$inferInsert;

// ---------------------------------------------------------------------------
// ingest_runs
// ---------------------------------------------------------------------------

export type IngestTrigger = "cron" | "manual";
export type RunStatus = "running" | "success" | "error";

/**
 * Makes CLAUDE.md's "log every outbound request" durable rather than only present in
 * Vercel's logs, and makes a failed run visible without tailing them. The row is written
 * as `running` before any network call, so a timed-out invocation still leaves a trace.
 */
export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull().default(ORG_DEFAULT),
    trigger: text("trigger").$type<IngestTrigger>().notNull(),
    status: text("status").$type<RunStatus>().notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),

    /** Stored exactly as sent to SAM: MM/DD/YYYY. */
    postedFrom: text("posted_from").notNull(),
    postedTo: text("posted_to").notNull(),
    naicsCodes: jsonb("naics_codes").$type<string[]>().notNull(),

    pagesFetched: integer("pages_fetched").notNull().default(0),
    recordsSeen: integer("records_seen").notNull().default(0),
    recordsInserted: integer("records_inserted").notNull().default(0),
    recordsUpdated: integer("records_updated").notNull().default(0),
    recordsSkipped: integer("records_skipped").notNull().default(0),
    /** The envelope's `totalRecords`, for comparison against what we actually fetched. */
    totalRecordsReported: integer("total_records_reported"),
    /**
     * True when pagination stopped at the hard page cap with records still outstanding —
     * the signal that we are silently missing notices.
     */
    cappedOut: boolean("capped_out").notNull().default(false),

    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestLog: jsonb("request_log")
      .$type<SamRequestLogEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [index("ingest_runs_org_started_idx").on(t.organizationId, t.startedAt)],
);

export type IngestRun = typeof ingestRuns.$inferSelect;
export type NewIngestRun = typeof ingestRuns.$inferInsert;

// ---------------------------------------------------------------------------
// digest_sends
// ---------------------------------------------------------------------------

export type DigestStatus = "sent" | "skipped" | "error";

/** One row per digest run, recording who it reached and which notices it covered. */
export const digestSends = pgTable(
  "digest_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull().default(ORG_DEFAULT),
    trigger: text("trigger").$type<IngestTrigger>().notNull(),
    status: text("status").$type<DigestStatus>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),

    recipients: jsonb("recipients").$type<string[]>().notNull(),
    subject: text("subject"),
    biddableCount: integer("biddable_count").notNull().default(0),
    informationalCount: integer("informational_count").notNull().default(0),
    noticeIds: jsonb("notice_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Resend message id per recipient — one send call each, so one id each. */
    providerMessageIds: jsonb("provider_message_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
  },
  (t) => [index("digest_sends_org_sent_idx").on(t.organizationId, t.sentAt)],
);

export type DigestSend = typeof digestSends.$inferSelect;
export type NewDigestSend = typeof digestSends.$inferInsert;
