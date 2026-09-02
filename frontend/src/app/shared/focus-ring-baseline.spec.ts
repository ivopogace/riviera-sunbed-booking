import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_LARGE, contrastRatio } from '../../testing/contrast';
import { baseLayerBlock, STYLESHEET } from '../../testing/stylesheet-tokens';

/**
 * Guard for the focus-indicator baseline (#890): the `@layer base` rule in `src/tailwind.css`
 * that paints the project's 3px `--riv-accent-ink` ring on every `<button>`'s `:focus-visible`.
 *
 * <p>Before it, the tree answered "what does a focused button look like" twice — 60 explicit
 * `focus-visible:outline-[3px]` sites, and 85 buttons across 26 files that showed whatever the
 * user agent drew. Nothing recorded which was intended, and nothing guarded the second answer:
 * Preflight resets no outline, so the UA ring was load-bearing for half the tree, and a single
 * `outline-none` written for visual reasons would have removed the only indicator those controls
 * had with no test to notice. The sweep here is that test.
 *
 * <p>What jsdom cannot see is the cascade: whether the rule really sits in the `base` layer, so
 * that a site's own `focus-visible:outline-white` (fixed-dark hosts) or inset offset (clipped
 * tiles) still wins. The declaration is asserted here as text; the render is
 * `e2e/focus-ring-baseline.e2e.ts`, the same split every token guard in this folder uses.
 */
const APP_ROOT = join(process.cwd(), 'src/app');

/** The design doc that recorded the sign-out button's indicator as unstyled before this baseline. */
const DESIGN_DOC = join(process.cwd(), '../docs/design/non-text-contrast.md');

/** This file, the one source allowed to spell the suppression tokens — it is the sweep. */
const SELF = 'shared/focus-ring-baseline.spec.ts';

/** The natively focusable tags a suppression is never acceptable on; a heading is not one. */
const CONTROL_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);

/**
 * The one button host that does not follow the theme: the sign-out warning bar, fixed white with
 * `#b3261e` ink in every theme (`app.ts` records the deviation). The themed baseline ring resolves
 * `#7cd7e8` in dark, which on white is under 2:1 — so its buttons pin the ring to their own ink.
 */
const FIXED_LIGHT_HOST = {
  path: 'app.html',
  buttons: ['sign-out-retry', 'sign-out-dismiss'],
  ring: 'focus-visible:outline-current',
  ink: '#b3261e',
  fill: '#ffffff',
} as const;

/** Every way a class string or arbitrary property can turn the indicator off. */
const SUPPRESSION = /outline-none|outline-hidden|outline-0\b|outline:\s*none/g;

/** Every `.ts`/`.html` under `src/app` except this one — inline templates make both extensions markup. */
function allSources(): readonly string[] {
  return readdirSync(APP_ROOT, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => /\.(ts|html)$/.test(path) && path !== SELF);
}

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/**
 * The tag whose start tag encloses `index`, or `undefined` when the match sits in no start tag at
 * all — a class-string constant in TypeScript, which the sweep treats as a control's, since it
 * cannot prove otherwise.
 */
function enclosingTag(text: string, index: number): string | undefined {
  const open = text.lastIndexOf('<', index);
  if (open === -1 || text.lastIndexOf('>', index) > open) {
    return undefined;
  }
  return /^<([a-zA-Z][\w-]*)/.exec(text.slice(open))?.[1]?.toLowerCase();
}

describe('the focus-ring baseline (#890)', () => {
  it('declares the baseline ring once, inside @layer base', () => {
    const base = baseLayerBlock();

    expect(base).toMatch(
      /button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--riv-accent-ink\);/,
    );
    expect(base).toMatch(/button:focus-visible\s*\{[^}]*outline-offset:\s*2px;/);
    expect(STYLESHEET.match(/button:focus-visible/g), 'declared once, nowhere else').toHaveLength(
      1,
    );
  });

  it('every explicit ring is the same 3px the baseline paints', () => {
    const widths = allSources().flatMap((path) =>
      [...read(path).matchAll(/focus-visible:outline-\[(\d+)px\]/g)].map(
        (match) => `${path}: ${match[1]}px`,
      ),
    );

    expect(widths.length, 'the explicit sites this rule was derived from').toBeGreaterThan(0);
    expect(widths.filter((width) => !width.endsWith(': 3px'))).toEqual([]);
  });

  it('no control suppresses its outline — the baseline is the only indicator half the tree has', () => {
    const offenders = allSources().flatMap((path) => {
      const text = read(path);
      return [...text.matchAll(SUPPRESSION)]
        .map((match) => ({ tag: enclosingTag(text, match.index), token: match[0] }))
        .filter(({ tag }) => tag === undefined || CONTROL_TAGS.has(tag))
        .map(({ tag, token }) => `${path}: ${token} on <${tag ?? 'no element'}>`);
    });

    expect(offenders).toEqual([]);
  });

  it('the design doc no longer records the indicator as unstyled', () => {
    const doc = readFileSync(DESIGN_DOC, 'utf8');

    expect(doc).not.toContain('today an unstyled');
    expect(doc).toContain('focus-ring-baseline');
  });

  it('the buttons on the fixed-white sign-out bar pin the ring to their own ink, which clears 3:1', () => {
    const html = read(FIXED_LIGHT_HOST.path);

    for (const id of FIXED_LIGHT_HOST.buttons) {
      const button = /<button\b[^>]*>/g
        .exec(html.slice(html.indexOf(`data-testid="${id}"`) - 400))
        ?.at(0);
      expect(button, id).toContain(FIXED_LIGHT_HOST.ring);
    }
    expect(contrastRatio(FIXED_LIGHT_HOST.ink, FIXED_LIGHT_HOST.fill)).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
  });
});
