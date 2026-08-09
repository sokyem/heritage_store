// Default content for editable site sections.
// Used as fallback when the database has no entry yet,
// and as the seed shape for the admin editor.

export interface AboutDesignerContent {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  imageUrl: string;
  imageAlt: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
}

export interface HeroContent {
  videoUrl: string;
  videoAlt: string;
}

export interface MatchdayFeatureContent {
  enabled: boolean;
  badge: string;            // "Ghana Jerseys"
  badgeAccent: string;      // "✨ New"
  title: string;            // "Get Ready for the Ultimate Drip"
  body: string;             // 1-paragraph description
  ctaPrimaryLabel: string;  // "Shop Now"
  ctaPrimaryHref: string;   // "/matchday" or https://matchday.awulak.com
  ctaSecondaryLabel: string; // "TikTok"
  ctaSecondaryHref: string; // tiktok shop url
  promoVideoUrl: string;    // video shown in the promo section (homepage + matchday page)
}

export const DEFAULT_ABOUT_DESIGNER: AboutDesignerContent = {
  eyebrow: 'About the Designer',
  title: 'Awula K — A Vision Rooted in Heritage.',
  paragraphs: [
    'Born and raised in Ghana, Awula K founded the atelier with a singular conviction: that African luxury deserves a global stage on its own terms. Her work bridges traditional Ghanaian craftsmanship — ankara prints, kente, hand-beadwork, and bespoke tailoring — with the precision and finish demanded by the modern luxury client.',
    'Every garment is conceived as a personal narrative. From the first consultation through final fitting, the designer remains directly involved, ensuring each piece reflects both heritage and the individual it was made for.',
    'Today, AWULA K dresses clients across continents — for weddings, ceremonies, and the everyday moments where intention matters most.',
  ],
  imageUrl: '/media/designer-portrait-awula.jpg',
  imageAlt: 'Awula K — Founder & Creative Director',
  ctaPrimaryLabel: 'Meet the Designer',
  ctaPrimaryHref: '/consults',
  ctaSecondaryLabel: 'Follow on Instagram',
  ctaSecondaryHref: 'https://www.instagram.com/awula_k_/',
};

export const DEFAULT_HERO: HeroContent = {
  videoUrl: '/media/hero-video.mp4',
  videoAlt: 'AWULA K Hero Background',
};

export const DEFAULT_MATCHDAY_FEATURE: MatchdayFeatureContent = {
  enabled: true,
  badge: 'Ghana Jerseys',
  badgeAccent: '✨ New',
  title: 'Get Ready for the Ultimate Drip',
  body: 'The Ghana Black Stars jersey collection is here. Show your pride for the national team.',
  ctaPrimaryLabel: 'Shop Now',
  ctaPrimaryHref: '/matchday',
  ctaSecondaryLabel: 'TikTok',
  ctaSecondaryHref: 'https://www.tiktok.com/t/ZP9YR5dxa5uEn-IDKgJ/',
  promoVideoUrl: '/media/matchday-promo.mp4',
};
