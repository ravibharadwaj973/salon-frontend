import { defineConfig } from 'vitest/config';

/**
 * Tests for the parts of this app that are plain TypeScript.
 *
 * Deliberately not a component-rendering setup: no jsdom, no React testing
 * library, no Next runtime. Those are worth having one day, and wanting them is
 * how a frontend ends up with no tests at all for two years — the decisions that
 * have actually cost customers here live in small pure modules (which paths a
 * customer may open, how a date is formatted in the salon's timezone), and those
 * need nothing but a runner.
 *
 * `environment: 'node'` because none of it touches a DOM. Anything that does
 * should get its own config rather than slowing this one down.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
