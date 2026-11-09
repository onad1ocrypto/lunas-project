import type { MetadataRoute } from "next";

const SITE = "https://lunasproject.site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed-in product surfaces and API routes are not public pages.
        disallow: ["/api/", "/dashboard", "/insights", "/orders", "/profile"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
