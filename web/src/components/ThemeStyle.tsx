import { getSetting, DEFAULT_SETTINGS, type ThemeSettings } from '@/lib/settings';

/**
 * Server component that injects admin-controlled CSS variables (and any
 * custom CSS) into the document head. Rendered once from RootLayout so the
 * variables defined in globals.css can be overridden without a redeploy.
 *
 * Falls back to defaults if the AppSetting table is unreachable.
 */
export default async function ThemeStyle() {
  let theme: ThemeSettings;
  try {
    theme = await getSetting('theme');
  } catch {
    theme = DEFAULT_SETTINGS.theme;
  }

  const radius =
    theme.buttonStyle === 'pill'
      ? '9999px'
      : theme.buttonStyle === 'rounded'
        ? '12px'
        : theme.radius;

  const css = `:root{
  --aw-navy:${theme.brandPrimary};
  --aw-gold-deep:${theme.brandSecondary};
  --aw-warm-gray:${theme.brandAccent};
  --aw-ivory:${theme.background};
  --background:${theme.background};
  --aw-white:${theme.surface};
  --aw-text:${theme.textPrimary};
  --foreground:${theme.textPrimary};
  --aw-text-light:${theme.textMuted};
  --aw-border:${theme.border};
  --radius:${theme.radius};
  --aw-button-radius:${radius};
  --font-heading:'${theme.fontHeading.replace(/'/g, '')}',var(--font-playfair),'Georgia',serif;
  --font-body:'${theme.fontBody.replace(/'/g, '')}',var(--font-dm-sans),-apple-system,'Segoe UI',sans-serif;
}
${theme.customCss || ''}`;

  return <style id="aw-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}
