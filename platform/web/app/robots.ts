import type { MetadataRoute } from "next";
import { publicAppUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = publicAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/search?", "/saved-searches"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
