/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        aw: {
          navy: '#1B2A5B',
          'navy-light': '#2C3E7A',
          'navy-dark': '#0F1A3A',
          // Brand gold. `gold` is decorative and belongs on navy; `gold-deep`
          // is the interactive tone that stays readable behind white text.
          gold: '#D4AF37',
          'gold-light': '#E4C766',
          'gold-deep': '#8F6F1A',
          // Danger only — not a brand accent.
          crimson: '#C41E3A',
          'crimson-light': '#E8364F',
          ivory: '#FAF7F2',
          cream: '#F0EBE3',
          'warm-gray': '#8B7569',
          text: '#2C1A11',
          'text-light': '#5C3D2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-geist-sans)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeIn 0.6s ease-out',
        'scale-in': 'scaleIn 0.5s ease-out',
        'slide-in-left': 'fadeIn 0.6s ease-out',
      },
    },
  },
  plugins: [],
};
