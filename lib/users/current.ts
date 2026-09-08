import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users, type User } from "@/db/schema";

export const ORGANIZATION_ID = "default";

/**
 * Resolves the acting user.
 *
 * There is no session yet — CLAUDE.md specifies single-user with no auth beyond an
 * env-var password, and that gate is not built. Until it is, this returns the
 * earliest-created enabled user in the default organisation.
 *
 * The consequence is worth stating plainly: triage (save/dismiss) is effectively
 * organisation-wide, and seeding a second user row would have them silently share one
 * user's triage state. `notice_states` is already keyed by `user_id`, so adding real
 * sessions means replacing this function and nothing else.
 *
 * Throws rather than returning null: a dashboard with no user is a misconfiguration
 * (the table starts empty and is seeded by hand), and failing loudly beats rendering an
 * empty page that looks like a quiet day.
 */
export async function getCurrentUser(): Promise<User> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, ORGANIZATION_ID), eq(users.digestEnabled, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);

  if (!user) {
    throw new Error(
      "No enabled user found. Seed a row into `users` " +
        `(organization_id = '${ORGANIZATION_ID}', digest_enabled = true) before using the dashboard.`,
    );
  }
  return user;
}

/** Initials for the header avatar. Falls back to the email's first character. */
export function userInitials(user: Pick<User, "name" | "email">): string {
  const source = user.name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]!.toUpperCase());
    if (initials.length > 0) return initials.join("");
  }
  return user.email.charAt(0).toUpperCase();
}
