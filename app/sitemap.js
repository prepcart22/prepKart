import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://prepcart.ca";
const LOCALES = ["en", "fr"];
const DEFAULT_LOCALE = "en";

// Static routes that exist for both locales.
// Auth pages, dashboard, admin, and other private routes are intentionally excluded.
const STATIC_ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/blog", priority: 0.9, changeFrequency: "daily" },
  { path: "/legal-terms-policy", priority: 0.3, changeFrequency: "yearly" },
];

// Build a sitemap entry with hreflang alternates for both locales.
function buildEntry(path, options = {}) {
  const languages = {};
  for (const locale of LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${path}`;
  }
  // x-default tells Google which version to show when no language matches.
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}${path}`;

  return {
    url: `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
    lastModified: options.lastModified || new Date(),
    changeFrequency: options.changeFrequency || "weekly",
    priority: options.priority ?? 0.5,
    alternates: { languages },
  };
}

export default async function sitemap() {
  const entries = STATIC_ROUTES.map((route) =>
    buildEntry(route.path, {
      priority: route.priority,
      changeFrequency: route.changeFrequency,
    })
  );

  // Add published blog posts. If the database is unreachable
  // (e.g. running locally without DB access), still return the static routes.
  try {
    await connectDB();
    const blogs = await Blog.find({ published: true })
      .select("slug updatedAt publishedAt")
      .lean();

    for (const blog of blogs) {
      entries.push(
        buildEntry(`/blog/${blog.slug}`, {
          lastModified: blog.updatedAt || blog.publishedAt || new Date(),
          changeFrequency: "monthly",
          priority: 0.7,
        })
      );
    }
  } catch (err) {
    console.error("Sitemap: blog fetch failed:", err.message);
  }

  return entries;
}