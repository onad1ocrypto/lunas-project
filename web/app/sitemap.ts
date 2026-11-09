import type { MetadataRoute } from "next";

const SITE = "https://lunasproject.site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE}/signin`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
