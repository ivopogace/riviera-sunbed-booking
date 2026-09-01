import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CLASS_O_TINTS } from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the **class-O tint tokens** (#852) — the base colours behind every colour position that
 * carries Tailwind's `/opacity` modifier.
 *
 * <p>The audit's class O had been held back on a premise that does not survive measurement:
 * "tokenising is a computed-value change". It is not. Tailwind compiles `bg-[#2bb8d4]/20` to
 * `color-mix(in oklab, #2bb8d4 20%, transparent)`, so the literal form ALREADY produces a
 * `color-mix()`; it compiles `bg-riv-x/20` to the same expression with `var(--riv-x)` in the colour
 * slot. The settled rule (**B**, `docs/design/colour-literal-token-audit.md` § Class O) is therefore
 * the narrowest substitution available: **the modifier stays at the call site, the literal inside it
 * becomes a token**. One token per base colour; the alpha stays where the comment explaining it is.
 *
 * <p>What this file owns is the part no per-surface AA spec can see — that each base colour is a
 * token, is declared ONCE, and stays theme-invariant. Every consumer sits either inside
 * `operator-console` (whose host pins porcelain) or on a fixed-white panel, so a dark branch would
 * be unreachable by construction and jsdom maths could not see one added later: every ratio in the
 * tree would still pass. So the declaration tests read `src/tailwind.css` as text (the
 * `core/theme-boot.spec.ts` drift-guard pattern, via `testing/stylesheet-tokens.ts`), the sweep
 * reads the component sources, and the cross-theme proof against a real render — where the cascade
 * rather than a regex decides — is `e2e/class-o-tint-tokens.e2e.ts`.
 *
 * <p>It lives in `shared/` rather than `operator/` because the population it sweeps is tree-wide:
 * 43 of the 44 positions are console chrome, but `shared/confirm-panel.ts` carries the 44th, and
 * the final sweep has to be able to fail on any of them. Same home, and the same reason, as
 * `solid-fill-tokens.contrast.spec.ts`.
 *
 * <p>Per-surface AA/1.4.11 proofs are NOT here. They stay with their elements, in the tab and
 * component contrast specs, where the composited surface is known — this slice moves no pixel
 * (29 colour x alpha pairs over 5 host colours, 145/145 byte-identical composites), so those
 * ratios are unchanged by construction and none of them was re-derived.
 */

/** Vitest runs with cwd = `frontend/`. */
const APP = join(process.cwd(), 'src/app');

/** The colour-taking utility prefixes, matching the ledger's own population command. */
const COLOUR_UTILITIES = '(?:text|bg|border|fill|stroke|shadow|from|to|via)';

/**
 * One base colour's `/opacity` form, matched by **form**. The `]/α` suffix is the whole
 * discriminator, and the reason this sweep is safe to run tree-wide: every one of these base
 * colours ALSO appears somewhere as a plain ink, fill, border or gradient stop, and those are other
 * classes of the audit and other slices' work. Matching by value alone would reach into
 * `--riv-solid-fill-danger`, `--riv-accent-strong` and `--riv-error-ink`, none of which is ours.
 * The mirror image of the `(?!\/)` lookaheads in `solid-fill-tokens.contrast.spec.ts`, which
 * excluded these same positions from that slice for the same reason.
 *
 * <p>Built from the value rather than by patching a shared pattern's `source`: string surgery on a
 * regex is the kind of helper that fails OPEN — a search string that stops matching yields a
 * pattern matching nothing, and a sweep asserting `[]` then passes for the wrong reason, silently.
 * Caught exactly that way while writing this, which is why the meta-test below exists.
 */
function opacityLiteralOf(value: string): RegExp {
  return new RegExp(`${COLOUR_UTILITIES}-\\[${value}\\]/[0-9.]+`, 'i');
}

/** App sources that could paint one. Templates are inline `.ts` for much of the console. */
function appSources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

/**
 * Paths, not sources — the assertion names the file to fix rather than dumping the component that
 * failed it. Scoped to the token's own base colour so a phase's sweep fails on its own family.
 */
function filesPaintingLiteral(value: string): readonly string[] {
  const literal = opacityLiteralOf(value);
  return appSources().filter((path) => literal.test(readFileSync(join(APP, path), 'utf8')));
}

describe('Class-O tint tokens (rule B: the modifier stays, the literal becomes a token — #852)', () => {
  /**
   * The sweep below asserts an EMPTY list, so it passes both when the migration is complete and
   * when the matcher is broken. This is the test that tells the two apart — it fails if
   * `opacityLiteralOf` stops recognising the form it is meant to find, and it names the two
   * discriminators the sweep's safety rests on: the `/α` modifier must be required, and a plain
   * literal of the same value must NOT match (those belong to other classes of the audit).
   */
  it('recognises the `/opacity` form, and only it — the sweep must be able to fail', () => {
    const literal = opacityLiteralOf('#0c2a33');

    expect(literal.test('border-[#0c2a33]/15 bg-white/85')).toBe(true);
    expect(literal.test('bg-[#0c2a33]/4')).toBe(true);
    expect(literal.test('text-[#0c2a33] font-semibold')).toBe(false);
    expect(literal.test('border-riv-console-tint/15')).toBe(false);
  });

  describe.each(CLASS_O_TINTS)('$token', ({ token, value }) => {
    it('is declared exactly once, so no theme block can override it', () => {
      expect(declarationsOf(token), `${token} declarations`).toHaveLength(1);
    });

    it('is declared in the base block, which the console pin resolves', () => {
      expect(baseBlock(), `${token} in the base block`).toContain(`${token}:`);
    });

    it('declares the value this test mirror carries', () => {
      expect(declarationsOf(token)[0], token).toBe(value);
    });

    it('is mapped in `@theme inline`, without which the utility never generates', () => {
      expect(
        declarationsOf(`--color-riv-${token.slice('--riv-'.length)}`),
        'the @theme inline row',
      ).toEqual([`var(${token})`]);
    });

    it('leaves no app source painting its base colour as an `/opacity` literal', () => {
      expect(filesPaintingLiteral(value)).toEqual([]);
    });
  });
});
