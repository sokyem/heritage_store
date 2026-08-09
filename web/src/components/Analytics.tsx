'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { GA4_ID, META_PIXEL_ID, trackPageView } from '@/lib/analytics';

/**
 * Loads the Meta Pixel and GA4 tags and fires a page view on every SPA
 * navigation. Renders nothing if neither ID is configured, so it is safe to
 * mount unconditionally in the root layout.
 *
 * Configure with NEXT_PUBLIC_META_PIXEL_ID and NEXT_PUBLIC_GA4_ID.
 */
export default function Analytics() {
  const pathname = usePathname();
  // Skip the very first effect run — the inline init scripts already fire the
  // initial PageView, so we only want to track subsequent client navigations.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  if (!META_PIXEL_ID && !GA4_ID) return null;

  return (
    <>
      {META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA4_ID}', { send_page_view: true });
            `}
          </Script>
        </>
      )}
    </>
  );
}
