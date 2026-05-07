const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://prepcart.ca";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/admin-register",
          "/dashboard",
          "/grocery-list/",
          "/plans/",
          "/pantry",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}