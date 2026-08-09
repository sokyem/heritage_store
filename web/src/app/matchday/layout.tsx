import type { Metadata } from 'next';
import { ReactNode } from 'react';

const BASE_URL = 'https://www.awulak.com';

export const metadata: Metadata = {
  title: 'Ghana Black Stars Jerseys — Matchday by Awula K',
  description: 'Official Ghana Black Stars kits. Every jersey, every kit — shop now and rep the Stars. Ships within 5–7 business days.',
  openGraph: {
    title: 'Ghana Black Stars Jerseys — Matchday by Awula K',
    description: 'Rep the Stars. Shop official Ghana Black Stars jerseys. Ships in 5–7 days.',
    url: `${BASE_URL}/matchday`,
    siteName: 'Awula K',
    images: [
      {
        url: `${BASE_URL}/media/storefront/shopify/ghana-jersey.png`,
        width: 1200,
        height: 630,
        alt: 'Ghana Black Stars Jersey — Matchday by Awula K',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ghana Black Stars Jerseys — Matchday by Awula K',
    description: 'Rep the Stars. Shop official Ghana Black Stars jerseys. Ships in 5–7 days.',
    images: [`${BASE_URL}/media/storefront/shopify/ghana-jersey.png`],
  },
};

export default function MatchdayLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
