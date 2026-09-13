import type { Config } from 'tailwindcss';

/**
 * Salon OS design tokens.
 *
 * Warm neutrals (stone) rather than cold greys, with a plum-rose accent — a
 * salon is not a bank. Semantic colours are kept few on purpose: brand for
 * action, emerald for money in, rose for money out or danger, amber for
 * attention.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FDF2F6',
          100: '#FCE7EF',
          200: '#FACFDF',
          300: '#F5A8C4',
          400: '#EC739F',
          500: '#DE4680',
          600: '#B03A6B',
          700: '#8E2D56',
          800: '#762748',
          900: '#63243E',
        },
        ink: {
          DEFAULT: '#1C1917',
          muted: '#78716C',
          subtle: '#A8A29E',
        },
        canvas: '#FAFAF9',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 1px 3px 0 rgb(28 25 23 / 0.06)',
        pop: '0 10px 30px -10px rgb(28 25 23 / 0.20)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 160ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
