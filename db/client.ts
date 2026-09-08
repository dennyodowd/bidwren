import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { requireEnv } from "@/lib/env";

import * as schema from "./schema";

/**
 * Neon over HTTP rather than the WebSocket pool.
 *
 * `neon-http` issues one HTTPS fetch per query with no socket to open, keep warm or
 * drain. In a serverless function that lives for a single request, `neon-serverless`
 * would pay connection setup and teardown for no benefit and risk leaking sockets across
 * frozen invocations.
 *
 * The cost: `db.transaction()` throws on this driver. We never need an interactive
 * transaction — writes are single multi-row upserts and single updates — and `db.batch()`
 * is available if atomic multi-statement writes are ever required. Switching to
 * `drizzle-orm/neon-serverless` later leaves the schema and every call site unchanged.
 */
let cached: NeonHttpDatabase<typeof schema> | undefined;

/**
 * Lazy rather than module-level: a top-level `requireEnv` would throw at import time,
 * which can fire during `next build`'s module graph analysis in an environment without
 * DATABASE_URL. Memoised so a warm lambda reuses one client.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    cached = drizzle(neon(requireEnv("DATABASE_URL")), { schema });
  }
  return cached;
}

export { schema };
