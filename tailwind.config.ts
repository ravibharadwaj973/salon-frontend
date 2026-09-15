import type { Config } from 'tailwindcss';

/**
 * Parlon design tokens.
 *
 * The colour tokens here are the marketing site's, value for value — brand,
 * canvas and ink. One palette across the website, the salon app and the
 * console, so a salon that decides on the pricing page and then signs in is
 * looking at the same product rather than two that share a name. Semantic colours are kept few on purpose: brand for
 * action, emerald for money in, rose for money out or danger, amber for
 * attention.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        canvas: '#fdfaf6',
        ink: {
          DEFAULT: '#1c1917',
          muted: '#57534e',
          subtle: '#a8a29e',
        },
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
        // The marketing site's card shadow, value for value.
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 8px 24px -12px rgb(28 25 23 / 0.10)',
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
