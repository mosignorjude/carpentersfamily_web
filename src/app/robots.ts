import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site.mjs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/tickets"],
      disallow: ["/admin", "/portal", "/officers", "/settings", "/api/"],
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
