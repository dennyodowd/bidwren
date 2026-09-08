import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Notes",
  description:
    "Field notes from building Bidwren — working with the SAM.gov Opportunities API and federal contract data.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <main className="min-h-screen bg-paper-200 pb-20">
      <SiteHeader current="blog" />

      <div className="mx-auto max-w-[680px] px-5">
        <header className="border-b border-line-250 py-10">
          <h1 className="m-0 text-[30px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink-900">
            Notes
          </h1>
          <p className="mt-3 mb-0 text-[14px] leading-[1.55] text-ink-600">
            Field notes from building Bidwren — mostly the parts of federal contracting
            data that the documentation leaves out.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="py-10 text-[13px] text-ink-500">Nothing published yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {posts.map((post) => (
              <li key={post.slug} className="border-b border-line-200 py-7">
                <time
                  dateTime={post.date}
                  className="block font-mono text-[10px] tracking-[0.11em] text-ink-500"
                >
                  {post.dateLabel.toUpperCase()}
                </time>
                <h2 className="mt-2 mb-2 text-[19px] leading-[1.3] font-semibold tracking-[-0.015em]">
                  <Link href={`/blog/${post.slug}`} className="text-ink-900 no-underline hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="m-0 text-[13px] leading-[1.55] text-ink-600">
                  {post.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
