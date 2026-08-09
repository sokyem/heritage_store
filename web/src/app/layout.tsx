import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/providers";
import ThemeStyle from "../components/ThemeStyle";
import Analytics from "../components/Analytics";
import JsonLd from "../components/JsonLd";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { SITE_URL, absoluteUrl } from "@/lib/site-url";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  let general = DEFAULT_SETTINGS.general;
  let theme = DEFAULT_SETTINGS.theme;
  try {
    const s = await getSettings();
    general = s.general;
    theme = s.theme;
  } catch {}
  const siteName = general.siteName || 'HERITAGE STORE';
  const tagline = general.tagline || 'Quality ready-to-wear, made to last.';
  const title = `${siteName} — ${tagline}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${siteName}` },
    description: 'High-quality ready-to-wear essentials — t-shirts, polos, shirts, and jeans built from durable fabrics and considered fits.',
    keywords: ['ready-to-wear', 't-shirts', 'polos', 'shirts', 'jeans', 'quality basics', 'menswear', siteName],
    alternates: { canonical: '/' },
    icons: theme.faviconUrl ? { icon: theme.faviconUrl } : undefined,
    openGraph: {
      type: 'website',
      siteName,
      title,
      description: 'High-quality ready-to-wear essentials — t-shirts, polos, shirts, and jeans built to last.',
      url: SITE_URL,
      images: [{ url: '/media/IMG_8376.jpg', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: 'High-quality ready-to-wear essentials — t-shirts, polos, shirts, and jeans.',
      images: ['/media/IMG_8376.jpg'],
    },
  };
}

// Site-wide Organization + WebSite schema. WebSite's SearchAction lets Google
// surface our internal search box right inside the SERP. Pulled from settings
// so admins can update the brand without code changes.
async function getOrganizationJsonLd() {
  let general = DEFAULT_SETTINGS.general;
  let theme = DEFAULT_SETTINGS.theme;
  let integrations = DEFAULT_SETTINGS.integrations;
  try {
    const s = await getSettings();
    general = s.general;
    theme = s.theme;
    integrations = s.integrations;
  } catch {}
  const siteName = general.siteName || 'HERITAGE STORE';
  const logoUrl = theme.logoUrl ? absoluteUrl(theme.logoUrl) : absoluteUrl('/media/IMG_8376.jpg');
  const sameAs: string[] = [];
  if (integrations.instagramEnabled && integrations.instagramHandle) {
    const handle = integrations.instagramHandle.replace(/^@/, '');
    if (handle) sameAs.push(`https://www.instagram.com/${handle}`);
  }

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteName,
      url: SITE_URL,
      logo: logoUrl,
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const orgJsonLd = await getOrganizationJsonLd();
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning={true}
    >
      <head>
        <ThemeStyle />
        <JsonLd id="ld-organization" data={orgJsonLd} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning={true}>
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
