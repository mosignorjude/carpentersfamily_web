import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/tickets"],
      disallow: ["/admin", "/portal", "/officers", "/settings", "/api/"],
    },
    sitemap: "https://carpentersfamily.com.ng/sitemap.xml",
  };
}
