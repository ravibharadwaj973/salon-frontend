import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A SERVER COMPONENT MAY NOT CALL A FUNCTION THAT LIVES ON THE CLIENT.
 *
 * This test exists because that mistake reached production, and neither
 * TypeScript nor `next build` said a word about it.
 *
 * `lapsedCutoff` — a three-line date helper — was declared in a `'use client'`
 * module and imported by the customers page, which is a server component. The
 * build succeeded. The page then threw on every single request:
 *
 *   Attempted to call lapsedCutoff() from the server but lapsedCutoff is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * The customer book was unopenable, and the only evidence was a digest in the
 * hosting logs. Nothing in the type system can catch it: the signature is
 * correct, the import resolves, the value is a function. Next replaces every
 * export of a `'use client'` module with a *reference* the server hands to the
 * browser — a component survives that, because handing over a reference is what
 * rendering one does. A plain function does not: there is nothing left to call.
 *
 * ── What this checks, and why it is a name heuristic ────────────────────
 *
 * For every module that is NOT `'use client'`, every relative import that IS,
 * every named binding must look like a component — PascalCase — because that is
 * the one kind of export which crossing the boundary does not break.
 *
 * A name rule rather than real type analysis, deliberately. It needs no compiler
 * and no Next internals, it runs in milliseconds, and it is wrong only in the
 * direction that costs a rename: React components are PascalCase by convention
 * everywhere in this codebase, so a lowercase binding crossing this boundary is
 * a helper, and a helper crossing this boundary is the bug above.
 *
 * `import type` is fine and is filtered out — types are erased before any of
 * this matters.
 */

const ROOT = resolve(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const isClientModule = (text: string) => /^\s*['"]use client['"]/.test(text);

/** Resolve "./lapsed" against the importing file, trying the usual extensions. */
function resolveLocal(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one.
    }
  }
  return null;
}

interface Crossing {
  from: string;
  to: string;
  binding: string;
}

function findCrossings(): Crossing[] {
  const crossings: Crossing[] = [];

  for (const file of sourceFiles(ROOT)) {
    const text = readFileSync(file, 'utf8');
    // A client module importing another client module is not a boundary at all.
    if (isClientModule(text)) continue;

    const imports = text.matchAll(/import\s+([^;]*?)\s+from\s+['"](\.[^'"]+)['"]/gs);
    for (const match of imports) {
      const clause = match[1]!;
      const spec = match[2]!;

      // `import type { X } from` — erased entirely, never reaches runtime.
      if (/^\s*type\s/.test(clause)) continue;

      const target = resolveLocal(file, spec);
      if (!target) continue;
      if (!isClientModule(readFileSync(target, 'utf8'))) continue;

      const named = clause.match(/\{([^}]*)\}/)?.[1] ?? '';
      for (const raw of named.split(',')) {
        const binding = raw.trim();
        if (!binding) continue;
        // Per-specifier `type` marker: `{ type NavLink, SiteNav }`.
        if (/^type\s/.test(binding)) continue;

        const local = (binding.split(/\s+as\s+/).pop() ?? binding).trim();
        // PascalCase is a component, and a component is the one export that
        // survives being turned into a client reference.
        if (/^[A-Z]/.test(local)) continue;

        crossings.push({
          from: relative(ROOT, file),
          to: relative(ROOT, target),
          binding: local,
        });
      }
    }
  }

  return crossings;
}

describe('nothing on the server calls into a client module', () => {
  it('imports only components across the boundary', () => {
    const crossings = findCrossings();

    // Named in the failure, because "1 crossing" sends somebody hunting through
    // two hundred files for a bug whose symptom is a digest in a hosting log.
    expect(
      crossings.map((c) => `${c.from} imports { ${c.binding} } from ${c.to} — which is 'use client'`),
    ).toEqual([]);
  });

  it('actually recognises a client module when it sees one', () => {
    // A test that can never fail is worse than no test, and this one is a pile
    // of regexes over a directory tree. Prove both halves work before trusting
    // the empty result above.
    const files = sourceFiles(ROOT);
    const clients = files.filter((f) => isClientModule(readFileSync(f, 'utf8')));

    expect(files.length).toBeGreaterThan(50);
    expect(clients.length).toBeGreaterThan(10);
  });

  it('resolves a relative import that really exists', () => {
    const page = resolve(ROOT, 'app/(app)/customers/page.tsx');
    expect(resolveLocal(page, './lapsed')).toBe(resolve(ROOT, 'app/(app)/customers/lapsed.ts'));
  });
});
