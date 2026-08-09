// Maps a human color name (e.g. "Blue", "Royal Blue", "white") to a hex value
// for rendering color swatches. Case-insensitive; unknown names fall back to a
// neutral gray. Keep keys lowercase.
const COLOR_MAP: Record<string, string> = {
  navy: '#001f3f',
  white: '#ffffff',
  'spider white': '#f2f2f2',
  'off white': '#f6f3ec',
  ivory: '#fffff0',
  cream: '#f5efe0',
  black: '#111111',
  red: '#ce1126',
  crimson: '#b01030',
  maroon: '#7b1e2b',
  burgundy: '#7b1e2b',
  yellow: '#fcd116',
  gold: '#d4af37',
  orange: '#e8731c',
  green: '#006b3f',
  olive: '#5b6e2f',
  teal: '#0d8b8b',
  blue: '#1e63d0',
  'royal blue': '#1e63d0',
  'sky blue': '#87ceeb',
  'navy blue': '#001f3f',
  purple: '#7d3cb5',
  pink: '#ff6fa5',
  brown: '#6b4226',
  tan: '#d2b48c',
  beige: '#e8dcc4',
  khaki: '#c3b091',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  charcoal: '#36454f',
  multicolor: 'linear-gradient(135deg,#ce1126,#fcd116,#006b3f)',
  multi: 'linear-gradient(135deg,#ce1126,#fcd116,#006b3f)',
};

// Strip stray brackets/quotes (straight + smart) that can leak in from
// JSON-ish color values entered in admin, e.g. `["Orange` → `Orange`.
export function cleanColorName(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/[[\]"'“”‘’]/g, '').trim();
}

export function getColorHex(colorName?: string | null): string {
  const clean = cleanColorName(colorName);
  if (!clean) return '#cccccc';
  return COLOR_MAP[clean.toLowerCase()] || '#cccccc';
}
