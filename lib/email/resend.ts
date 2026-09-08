import { Resend } from "resend";

import { optionalEnv, requireEnv } from "@/lib/env";
import { log } from "@/lib/logger";

let cached: Resend | undefined;

/** Lazy, for the same reason as the database client: no throwing at import time. */
function getResend(): Resend {
  if (!cached) cached = new Resend(requireEnv("RESEND_API_KEY"));
  return cached;
}

export interface SendDigestArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Guards against a platform-level retry double-sending within the same window.
   * Verified against resend 6.26: this belongs in the request options argument, not
   * the payload, and is transmitted as the `Idempotency-Key` header.
   */
  idempotencyKey: string;
}

export interface SendResult {
  email: string;
  messageId: string | null;
  error: string | null;
}

/**
 * Sends one digest to one recipient.
 *
 * One call per recipient rather than a single call with an array of `to`: a hard bounce
 * on one address then cannot sink the rest, and no recipient's address is exposed to the
 * others in the To header.
 */
export async function sendDigestEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
}: SendDigestArgs): Promise<SendResult> {
  const from = requireEnv("DIGEST_FROM");

  // bidwren.com publishes no root MX, so replies to the From address would bounce.
  // Optional: unset means no Reply-To header rather than a fabricated address.
  const replyTo = optionalEnv("DIGEST_REPLY_TO");

  const { data, error } = await getResend().emails.send(
    { from, to, subject, html, text, ...(replyTo ? { replyTo } : {}) },
    { idempotencyKey },
  );

  if (error) {
    log.error("digest.send.failed", { to, error: error.message });
    return { email: to, messageId: null, error: error.message };
  }

  log.info("digest.send.ok", { to, messageId: data?.id });
  return { email: to, messageId: data?.id ?? null, error: null };
}
