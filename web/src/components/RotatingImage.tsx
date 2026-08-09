'use client';

import { useEffect, useState } from 'react';

/**
 * Cross-fades through a list of images on a timer. Used for multi-image
 * storefront banners. With one image it's just a static <img>.
 */
export default function RotatingImage({
  images,
  alt,
  className,
  intervalMs = 3500,
}: {
  images: string[];
  alt: string;
  className?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIndex((p) => (p + 1) % images.length), intervalMs);
    return () => clearInterval(t);
  }, [images.length, intervalMs]);

  const src = images[index] || images[0];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
