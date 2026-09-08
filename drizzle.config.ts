import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 0.31 does not read .env.local on its own — verified in its bundled CLI.
config({ path: ".env.local", quiet: true });

/**
 * Migrations prefer Neon's direct endpoint. The pooled (PgBouncer) endpoint runs
 * transaction pooling, which does not hold the session-level advisory locks drizzle-kit
 * uses to serialise migrations, and can hang or fail on DDL.
 *
 * This is a drizzle-kit config file rather than application code: the `??` expresses a
 * preference between two credential sources, not a fallback literal for a secret.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set. Add one to .env.local.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
