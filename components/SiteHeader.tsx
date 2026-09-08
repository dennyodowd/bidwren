import Link from "next/link";

/**
 * The slim site header, shared by every page that is not the dashboard.
 *
 * The dashboard keeps its own richer header — snapshot freshness, saved search, user
 * avatar — none of which means anything on a blog post. This carries only the wordmark
 * and a way back, using the same ink-900 bar so the two read as one site.
 */
export function SiteHeader({ current }: { current?: "blog" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 bg-ink-900 px-5 py-[13px] text-paper-200">
      <Link href="/" className="-my-1 flex items-center gap-[11px] py-1 text-paper-200 no-underline">
        <span
          aria-hidden
          className="h-[15px] w-[15px] rotate-45 bg-paper-200"
          style={{ borderRadius: "2px 6px 2px 6px" }}
        />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Bidwren</span>
      </Link>

      <nav className="flex items-center gap-5 font-mono text-[11px] tracking-[0.04em]">
        <Link href="/" className="-my-1.5 py-1.5 text-paper-200/70 no-underline hover:text-paper-200">
          DASHBOARD
        </Link>
        <Link
          href="/blog"
          aria-current={current === "blog" ? "page" : undefined}
          className={
            current === "blog"
              ? "-my-1.5 py-1.5 text-paper-200 no-underline"
              : "-my-1.5 py-1.5 text-paper-200/70 no-underline hover:text-paper-200"
          }
        >
          NOTES
        </Link>
      </nav>
    </header>
  );
}
