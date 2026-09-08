import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { digestSends, users } from "@/db/schema";
import { authorizeCron, unauthorized } from "@/lib/cron-auth";
import { requireAppUrl } from "@/lib/env";
import {
  digestSubject,
  renderDigestHtml,
  renderDigestText,
  type DigestData,
} from "@/lib/email/render-digest";
import { sendDigestEmail } from "@/lib/email/resend";
import { log } from "@/lib/logger";
import {
  getPendingDigestNotices,
  hasRecentSuccessfulIngest,
  markExpiredNoticesDigested,
  markNoticesDigested,
} from "@/lib/notices/queries";
import { ORGANIZATION_ID } from "@/lib/users/current";

// Same deliberate minimal segment config as the ingest route.
export const maxDuration = 60;

/** How recently an ingest must have succeeded for a digest to be trustworthy. */
const REQUIRE_INGEST_WITHIN_HOURS = 26;

export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) return unauthorized();

  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  /** Skips the ingest-recency guard. For local testing only. */
  const force = params.get("force") === "1";

  const db = getDb();
  const now = new Date();

  if (!force && !(await hasRecentSuccessfulIngest(REQUIRE_INGEST_WITHIN_HOURS))) {
    log.error("digest.no_recent_ingest", { withinHours: REQUIRE_INGEST_WITHIN_HOURS });
    return Response.json(
      {
        ok: false,
        code: "NO_RECENT_INGEST",
        message: `No successful ingest in the last ${REQUIRE_INGEST_WITHIN_HOURS}h. Refusing to send a digest built on stale or missing data.`,
      },
      { status: 503 },
    );
  }

  const recipients = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, ORGANIZATION_ID), eq(users.digestEnabled, true)));

  // The users table starts empty and is seeded by hand, so this is the likeliest
  // misconfiguration in the system. It must never look like a successful send.
  if (recipients.length === 0) {
    log.error("digest.no_recipients", {});
    return Response.json(
      {
        ok: false,
        code: "NO_RECIPIENTS",
        message:
          "No users with digest_enabled = true. Seed a row into `users` before running the digest.",
      },
      { status: 503 },
    );
  }

  // Drain notices that closed before we got to them. They are never emailed — a digest
  // is about what you can still act on — but they must leave the pending queue or they
  // would be re-evaluated forever. They remain on the dashboard as history.
  const expiredSkipped = dryRun ? 0 : await markExpiredNoticesDigested();

  const pending = await getPendingDigestNotices(now);
  const biddable = pending.filter((notice) => notice.isBiddable);
  // Everything that is not biddable — including unknown types such as "Special Notice",
  // which was 22% of a real sample. Never folded into the biddable section.
  //
  // Sorted by posted date rather than deadline: two thirds of this section carries no
  // deadline at all, so ranking it by one orders most rows on a field they lack.
  const earlyStage = pending
    .filter((notice) => !notice.isBiddable)
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate));

  if (pending.length === 0) {
    await db.insert(digestSends).values({
      organizationId: ORGANIZATION_ID,
      trigger: auth.trigger,
      status: "skipped",
      recipients: recipients.map((r) => r.email),
      biddableCount: 0,
      informationalCount: 0,
    });
    return Response.json({ ok: true, sent: false, reason: "no-matches", expiredSkipped });
  }

  const buildData = (recipientEmail: string): DigestData => ({
    biddable,
    earlyStage,
    dashboardUrl: requireAppUrl(),
    recipientEmail,
    sentAt: now,
  });

  const subject = digestSubject(buildData(recipients[0]!.email));

  /**
   * Gmail clips messages larger than roughly 102KB, hiding everything past the cut
   * behind a "View entire message" link.
   *
   * A normal day's volume sits far below this — a five-day sample of all four NAICS
   * codes came to 144 notices, so one day is nearer 30. It is a backlog that gets you
   * here, most likely the very first send after a multi-day backfill. Warn rather than
   * truncate: silently dropping notices from a digest is worse than a clipped email,
   * and they would still be marked as sent.
   */
  const renderedSize = Buffer.byteLength(renderDigestHtml(buildData(recipients[0]!.email)));
  if (renderedSize > 102_000) {
    log.warn("digest.size_exceeds_gmail_clip", {
      bytes: renderedSize,
      noticeCount: pending.length,
      hint: "Gmail will clip this. Likely a first-run backlog; consider marking older notices as already digested.",
    });
  }

  if (dryRun) {
    return new Response(renderDigestHtml(buildData(recipients[0]!.email)), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Send first, mark second. If marking fails afterwards the worst case is one duplicate
  // tomorrow; marking first would risk losing notices permanently on a failed send.
  const day = now.toISOString().slice(0, 10);
  const results = await Promise.all(
    recipients.map((recipient) => {
      const data = buildData(recipient.email);
      return sendDigestEmail({
        to: recipient.email,
        subject,
        html: renderDigestHtml(data),
        text: renderDigestText(data),
        idempotencyKey: `digest:${ORGANIZATION_ID}:${day}:${recipient.email}`,
      });
    }),
  );

  const delivered = results.filter((result) => !result.error);
  const failed = results.filter((result) => result.error);

  const providerMessageIds: Record<string, string> = {};
  for (const result of delivered) {
    if (result.messageId) providerMessageIds[result.email] = result.messageId;
  }

  await db.insert(digestSends).values({
    organizationId: ORGANIZATION_ID,
    trigger: auth.trigger,
    status: delivered.length > 0 ? "sent" : "error",
    recipients: delivered.map((result) => result.email),
    subject,
    biddableCount: biddable.length,
    informationalCount: earlyStage.length,
    noticeIds: pending.map((notice) => notice.noticeId),
    providerMessageIds,
    errorMessage: failed.length > 0 ? failed.map((f) => `${f.email}: ${f.error}`).join("; ") : null,
  });

  // Only mark them sent if the digest actually reached someone.
  if (delivered.length > 0) {
    await markNoticesDigested(pending.map((notice) => notice.noticeId));
  }

  const allFailed = delivered.length === 0;
  if (allFailed) log.error("digest.all_failed", { failed: failed.length });

  return Response.json(
    {
      ok: !allFailed,
      sent: delivered.length,
      failed: failed.length,
      biddableCount: biddable.length,
      informationalCount: earlyStage.length,
      noticeCount: pending.length,
      expiredSkipped,
      errors: failed.map((f) => ({ email: f.email, error: f.error })),
    },
    { status: allFailed ? 502 : 200 },
  );
}
