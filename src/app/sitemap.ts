import type { MetadataRoute } from "next";
import { SITE_ORIGIN, siteUrl } from "@/lib/site.mjs";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: SITE_ORIGIN,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: siteUrl("/tickets"),
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}
