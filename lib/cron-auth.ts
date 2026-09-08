import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { optionalEnv, requireEnv } from "@/lib/env";

export type CronTrigger = "cron" | "manual";

/** Constant-time comparison that tolerates differing lengths without leaking them. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface CronAuthResult {
  ok: boolean;
  trigger: CronTrigger;
}

/**
 * Authorises a cron route through either of two paths.
 *
 * `?secret=` against INGEST_SECRET is the manual trigger CLAUDE.md requires — debugging a
 * daily job that can only be fired by waiting until tomorrow is not workable.
 *
 * `Authorization: Bearer $CRON_SECRET` is how Vercel's scheduler authenticates. Vercel
 * only sends that header when CRON_SECRET is set on the project. The alternative — putting
 * ?secret= into vercel.json's cron path — would commit a secret to git, and trusting the
 * `x-vercel-cron` header alone is spoofable on a public route.
 */
export function authorizeCron(request: NextRequest): CronAuthResult {
  const provided = request.nextUrl.searchParams.get("secret");
  if (provided && safeEqual(provided, requireEnv("INGEST_SECRET"))) {
    return { ok: true, trigger: "manual" };
  }

  // Absent in local development, so optional rather than required.
  const cronSecret = optionalEnv("CRON_SECRET");
  const header = request.headers.get("authorization");
  if (cronSecret && header && safeEqual(header, `Bearer ${cronSecret}`)) {
    return { ok: true, trigger: "cron" };
  }

  return { ok: false, trigger: "manual" };
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
