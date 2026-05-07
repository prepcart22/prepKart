import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { locales } from "@/app/i18n/request";
import ProvidersClient from "./providers-client";
import "../globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://prepcart.ca";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const safeLocale = hasLocale(locales, locale) ? locale : "en";

  const t = await getTranslations({ locale: safeLocale, namespace: "metadata" });
  const title = t("title");
  const description = t("description");

  // Build hreflang map for the homepage of each locale.
  const languages = {};
  for (const loc of locales) {
    languages[loc] = `${SITE_URL}/${loc}`;
  }
  languages["x-default"] = `${SITE_URL}/en`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `Prepcart — ${title}`,
      template: "%s | Prepcart",
    },
    description,
    alternates: {
      canonical: `${SITE_URL}/${safeLocale}`,
      languages,
    },
    openGraph: {
      type: "website",
      locale: safeLocale === "fr" ? "fr_CA" : "en_CA",
      url: `${SITE_URL}/${safeLocale}`,
      siteName: "Prepcart",
      title: `Prepcart — ${title}`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `Prepcart — ${title}`,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  if (!hasLocale(locales, locale)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <ProvidersClient locale={locale} messages={messages}>
          {children}
        </ProvidersClient>
      </body>
    </html>
  );
}