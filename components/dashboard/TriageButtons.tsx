import { dismissNotice, restoreNotice, toggleSave } from "@/lib/notices/actions";
import type { NoticeCardData } from "@/lib/notices/dto";

/**
 * Save and dismiss controls.
 *
 * Plain <form> submissions calling Server Actions, so triage works with JavaScript
 * disabled and nothing here needs to be a client component.
 */

const BUTTON_BASE =
  "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[3px] border text-[14px] leading-none";

export function TriageButtons({ notice }: { notice: NoticeCardData }) {
  if (notice.isDismissed) {
    return (
      <div className="flex items-center justify-end gap-1">
        <form action={restoreNotice}>
          <input type="hidden" name="noticeId" value={notice.noticeId} />
          <button
            type="submit"
            title="Restore to list"
            className="cursor-pointer whitespace-nowrap rounded-[3px] border border-line-300 bg-surface-control px-2 py-1 text-[11px] font-medium text-signal-link"
          >
            Restore
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <form action={toggleSave}>
        <input type="hidden" name="noticeId" value={notice.noticeId} />
        {/* Current state rides along so the toggle needs no extra read. */}
        <input type="hidden" name="saved" value={notice.isSaved ? "1" : "0"} />
        <button
          type="submit"
          title={notice.isSaved ? "Saved — click to unsave" : "Save for review"}
          aria-pressed={notice.isSaved}
          className={
            notice.isSaved
              ? `${BUTTON_BASE} border-ink-900 bg-ink-900 text-paper-000`
              : `${BUTTON_BASE} border-line-300 bg-surface-control text-ink-450`
          }
        >
          {notice.isSaved ? "★" : "☆"}
          <span className="sr-only">{notice.isSaved ? "Unsave" : "Save"}</span>
        </button>
      </form>

      <form action={dismissNotice}>
        <input type="hidden" name="noticeId" value={notice.noticeId} />
        <button
          type="submit"
          title="Dismiss — hide from tomorrow's list"
          className={`${BUTTON_BASE} border-line-300 bg-surface-control text-ink-450 hover:border-ink-900 hover:bg-ink-900 hover:text-paper-000`}
        >
          ✕<span className="sr-only">Dismiss</span>
        </button>
      </form>
    </div>
  );
}
