import type { MetadataRoute } from "next";

import { requireAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = requireAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The cron handlers are secret-gated, but there is no reason to crawl them.
        disallow: "/api/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
