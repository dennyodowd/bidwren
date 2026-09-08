import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/SiteHeader";
import { getPost, getPostSlugs } from "@/lib/blog";

/**
 * Prerendered at build time — no request-time data, unlike the dashboard. Adding a post
 * is a markdown file plus a deploy.
 */
export async function generateStaticParams() {
  const slugs = await getPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    /**
     * The canonical is the load-bearing tag here: this post is mirrored to Dev.to and a
     * GitHub README, and without it search engines pick a winner themselves. Set the
     * mirrors' canonical_url to this same URL so they consolidate here.
     */
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
      siteName: "Bidwren",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <main className="min-h-screen bg-paper-200 pb-20">
      <SiteHeader current="blog" />

      <article className="mx-auto max-w-[680px] px-5">
        <header className="border-b border-line-250 py-10">
          <Link
            href="/blog"
            className="-my-2 inline-block py-2 font-mono text-[10px] tracking-[0.11em] text-ink-500 no-underline hover:text-ink-900"
          >
            ← ALL NOTES
          </Link>
          <h1 className="mt-4 mb-3 text-[30px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink-900">
            {post.title}
          </h1>
          <p className="m-0 text-[14px] leading-[1.55] text-ink-600">{post.description}</p>
          <time
            dateTime={post.date}
            className="mt-4 block font-mono text-[11px] tracking-[0.04em] text-ink-500"
          >
            {post.dateLabel}
          </time>
        </header>

        {/*
          Trusted content: these files are authored by us and committed to the repo.
          See lib/blog.ts before routing anything user-supplied through this.
        */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </main>
  );
}
