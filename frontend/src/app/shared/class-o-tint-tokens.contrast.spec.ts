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

/**
 * One class expression — a quoted string in a `.ts` class map or ternary, a `class="…"` in a
 * template. The unit that matters for the mixing rule below, because a FILE may legitimately hold
 * both forms: `set-editor.html` paints a plain `text-[#0c2a33]` ink (class T, another slice's) two
 * elements away from a `border-riv-console-tint/15`. Only sharing one expression is the fault.
 */
function classExpressions(source: string): readonly string[] {
  return [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2]);
}

/** A raw painting of one base colour, in either notation Tailwind accepts inside an expression. */
function rawLiteralOf(value: string): RegExp {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  return new RegExp(`${value}|rgba?\\(\\s*${r},\\s*${g},\\s*${b}\\b`, 'i');
}

/**
 * The **ladder** (#879, option C of the audit's class O): every class-O `/opacity` alpha is a
 * multiple of five.
 *
 * <p>Rule B (#852) tokenised all 44 positions while preserving each site's alpha exactly — the
 * right default for a migration, and the wrong end state for a palette: it left
 * `--riv-console-tint` painted at ten alphas across seventeen sites. The ladder is what collapses
 * that, and it is deliberately expressed as a constraint on the alphas rather than as a new token
 * shape. Pre-composing one token per (colour x alpha) pair would flip every `toHaveCSS` on these
 * sites from `oklab()` to `rgba()` and move each alpha away from the comment explaining it — the
 * same two objections that chose B over A in the first place.
 *
 * <p>Five was chosen because every class-O alpha except eight ALREADY sat on it, so the whole
 * normalisation moves 8 positions by at most 3 points (max channel delta 7/255, measured). It also
 * costs `beach-cell`'s aisle boundary nothing: that `/55` is load-bearing — 0.55 and not 0.35 for a
 * stated WCAG 1.4.11 reason — and it is a multiple of five already, so the rule never had to carve
 * an exemption for the one value that could not move.
 */
const LADDER_STEP = 5;

/**
 * Every `--riv-*` `/opacity` position in one source whose alpha is NOT on the ladder, as the matched
 * utility text so the failure names what to change rather than the file that held it.
 *
 * <p><strong>Scoped by FORM — any `riv-` token wearing a modifier — not by membership of
 * `CLASS_O_TINTS`.</strong> That is the correction the generalization audit forced, and it is worth
 * stating because the narrower version looked right: class O is defined by the `/α` modifier, and
 * two of its 44 positions deliberately reuse a token this array does not hold. `payouts-tab`'s
 * reason chip takes `--riv-console-negative-ink` — the ink token already on that element, because
 * there the value coincidence IS a role match (#864) — so an array-scoped sweep walked straight
 * past its `/28` and `/12` while reporting the ladder complete. Enumerating by the mechanism the
 * rule is actually about is what found them.
 *
 * <p>A pure function of a string on purpose: the sweep below asserts an EMPTY list, so the only
 * thing that can tell a finished normalisation from a broken matcher is a test that drives this
 * directly with a known-bad input. That is the meta-test beside it — the pairing this file already
 * uses for its form sweep, and the trap #852 hit once with an emptied guard passing vacuously.
 */
function offLadderIn(source: string): readonly string[] {
  const position = new RegExp(`${COLOUR_UTILITIES}-riv-[a-z-]+/([0-9.]+)`, 'g');

  return [...source.matchAll(position)]
    .filter(([, alpha]) => Number(alpha) % LADDER_STEP !== 0)
    .map(([match]) => match);
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

  /**
   * Class O, closed. The per-token sweeps below each police one base colour; this one polices the
   * FORM, so a *new* `/opacity` literal of a colour no token covers fails too. That is what turns
   * the audit's class O from a backlog into a boundary — the state its "should the exemption
   * classes become a lint rule?" section says a rule becomes worth writing in.
   *
   * <p>The pattern is the ledger's own population command, plus the `]/α` suffix.
   */
  it('leaves no `/opacity` colour literal anywhere in the app sources', () => {
    const anyLiteral = new RegExp(
      `${COLOUR_UTILITIES}-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\([^\\]]*\\))\\]/[0-9.]+`,
      'i',
    );

    const survivors = appSources().filter((path) =>
      anyLiteral.test(readFileSync(join(APP, path), 'utf8')),
    );

    expect(survivors).toEqual([]);
  });

  /**
   * The ladder's meta-test (#879). `offLadderIn` is driven with known-bad and known-good inputs
   * because the sweep after it asserts `[]` and would pass just as happily on a matcher that
   * stopped matching. It also pins the two boundaries the ladder rests on: `/55` is ON the ladder
   * (so the aisle boundary needs no exemption), and a colour outside class O is not this sweep's
   * business — `bg-white/85` belongs to whatever slice eventually names white's ladder.
   */
  it('recognises an off-ladder alpha, and only it — the ladder sweep must be able to fail', () => {
    expect(offLadderIn('border-riv-console-tint/14')).toEqual(['border-riv-console-tint/14']);
    expect(offLadderIn('bg-riv-console-tint/4')).toEqual(['bg-riv-console-tint/4']);
    expect(offLadderIn('bg-riv-select-tint/6')).toEqual(['bg-riv-select-tint/6']);
    // The audit's correction, pinned: a class-O position on a token outside CLASS_O_TINTS.
    expect(offLadderIn('bg-riv-console-negative-ink/12')).toEqual([
      'bg-riv-console-negative-ink/12',
    ]);

    expect(offLadderIn('border-riv-console-tint/15 bg-riv-console-tint/5')).toEqual([]);
    expect(offLadderIn('border-dashed border-riv-console-tint/55')).toEqual([]);
    expect(offLadderIn('border-riv-confirm-warn-edge/60')).toEqual([]);
    expect(offLadderIn('bg-white/85')).toEqual([]);
  });

  /**
   * Class O's alphas, normalised (#879). The companion to the form sweep above: that one says a
   * `/opacity` position must name a token, this one says the alpha it carries must sit on the
   * ladder. Together they are the whole boundary — a new position can be neither an untokenised
   * literal nor a freshly-invented alpha.
   */
  it('carries no `/opacity` alpha off the multiple-of-five ladder', () => {
    const offLadder = appSources().flatMap((path) =>
      offLadderIn(readFileSync(join(APP, path), 'utf8')).map((match) => `${path}: ${match}`),
    );

    expect(offLadder).toEqual([]);
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

    /**
     * The generalized form of the take-the-skin-whole rule (#858), and the reason it is a test
     * rather than a habit: a per-state map or ternary that names the token in one position and
     * writes the same colour raw in another is half-migrated, and reads as two colours to the next
     * person. Enumerating the mechanism — not the maps that resembled the first one found — is
     * what turned up `daily-view-tab`'s BOOKED_ONLINE tile, whose gradient painted this value raw
     * beside its own tokenised border.
     *
     * <p>Scoped to expressions rather than files on purpose: the same file may legitimately paint
     * this colour as a plain class-T ink elsewhere, which is another slice's work.
     */
    it('is never named in the same class expression as a raw literal of its own value', () => {
      const raw = rawLiteralOf(value);
      const utility = new RegExp(`-riv-${token.slice('--riv-'.length)}\\b`);

      const mixed = appSources().flatMap((path) =>
        classExpressions(readFileSync(join(APP, path), 'utf8'))
          .filter((expression) => utility.test(expression) && raw.test(expression))
          .map(() => path),
      );

      expect(mixed).toEqual([]);
    });
  });
});
