"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { noticeStates } from "@/db/schema";
import { getCurrentUser, ORGANIZATION_ID } from "@/lib/users/current";

/**
 * Triage actions behind the dashboard's star and cross buttons.
 *
 * These are Server Actions invoked by plain <form> submissions, so save and dismiss work
 * with JavaScript disabled and the rest of the page stays server-rendered.
 */

async function setState(
  noticeId: string,
  patch: Partial<Pick<typeof noticeStates.$inferInsert, "saved" | "dismissed" | "savedAt" | "dismissedAt">>,
) {
  const db = getDb();
  const user = await getCurrentUser();

  await db
    .insert(noticeStates)
    .values({
      organizationId: ORGANIZATION_ID,
      userId: user.id,
      noticeId,
      saved: false,
      dismissed: false,
      ...patch,
    })
    .onConflictDoUpdate({
      target: [noticeStates.organizationId, noticeStates.userId, noticeStates.noticeId],
      set: { ...patch, updatedAt: new Date() },
    });

  revalidatePath("/");
}

function requireNoticeId(formData: FormData): string {
  const noticeId = formData.get("noticeId");
  if (typeof noticeId !== "string" || !noticeId) {
    throw new Error("noticeId is required");
  }
  return noticeId;
}

export async function toggleSave(formData: FormData) {
  const noticeId = requireNoticeId(formData);
  // The current state rides along in the form so the toggle needs no extra read.
  const saved = formData.get("saved") === "1";
  await setState(noticeId, {
    saved: !saved,
    savedAt: saved ? null : new Date(),
  });
}

export async function dismissNotice(formData: FormData) {
  await setState(requireNoticeId(formData), { dismissed: true, dismissedAt: new Date() });
}

export async function restoreNotice(formData: FormData) {
  await setState(requireNoticeId(formData), { dismissed: false, dismissedAt: null });
}

/** Clears every dismissal for the current user — the toolbar's "Restore all". */
export async function restoreAllNotices() {
  const db = getDb();
  const user = await getCurrentUser();

  await db
    .update(noticeStates)
    .set({ dismissed: false, dismissedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(noticeStates.organizationId, ORGANIZATION_ID),
        eq(noticeStates.userId, user.id),
        eq(noticeStates.dismissed, true),
      ),
    );

  revalidatePath("/");
}
