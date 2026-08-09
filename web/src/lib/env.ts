// Environment variable validation — import this early in the app lifecycle

const required = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
] as const;

const recommended = [
  'GEMINI_API_KEY',
  'GEMINI_TEXT_MODEL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'ANTHROPIC_API_KEY',
] as const;

export function validateEnv() {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of required) {
    if (!process.env[key] || process.env[key] === '') {
      missing.push(key);
    }
  }

  for (const key of recommended) {
    if (!process.env[key] || process.env[key] === '' || process.env[key]?.includes('your_')) {
      warnings.push(key);
    }
  }

  // Check for placeholder values
  if (process.env.NEXTAUTH_SECRET === 'super-secret-key-change-in-production') {
    missing.push('NEXTAUTH_SECRET (still using placeholder — generate with: openssl rand -base64 32)');
  }

  if (missing.length > 0) {
    console.error(`\n[ENV] Missing required environment variables:\n  - ${missing.join('\n  - ')}\n`);
    // Only throw in production runtime, not during build
    if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[ENV] Missing recommended environment variables: ${warnings.join(', ')}`);
  }
}

// Auto-validate on import
validateEnv();
