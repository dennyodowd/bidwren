import type { MetadataRoute } from "next";

import { requireAppUrl } from "@/lib/env";
import { getAllPosts } from "@/lib/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = requireAppUrl();
  const posts = await getAllPosts();

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
