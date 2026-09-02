import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  rgbToHex,
} from '../../testing/contrast';
import {
  BANNER_BODY_INK,
  BANNER_FILLS,
  BANNER_STRONG_INK,
  CONSOLE_BTN_BORDER,
  CONSOLE_BTN_HOVER,
  CONSOLE_CARD_BORDER,
  DARK_CARD_INK,
  Glass,
  INK_DARK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  WHITE,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the fixed-fill and role-mismatch ink families, and for the refusal that defines them:
 * none of these sites can take `--riv-ink`, `--riv-card-ink` or `--riv-pop-ink`, because every
 * one sits on a fill that does not theme. The three agree in porcelain and diverge in dark, so the
 * failure is invisible to any porcelain-only check — which is why it is measured here rather than
 * asserted.
 *
 * <p>The availability calendar was the fourth family here until #888 un-pinned its fill: it is a
 * `--riv-pop-*` consumer now, and its themed palette is guarded where it lives,
 * `venue/availability-calendar.contrast.spec.ts`.
 *
 * <p>Lives in `shared/` because the population spans `booking/` and `operator/`, the same reason
 * as `warn-token-skin.contrast.spec.ts`. The complementary proof, where the cascade rather than a
 * regex decides, is `e2e/fixed-ink-token-recut.e2e.ts`.
 *
 * <p>Rationale: `docs/design/colour-literal-token-audit.md` (class T-3).
 */

/** `booking-view`'s banner prose and the six fixed fills that pin it. */
const BANNER_FAMILY = {
  '--riv-banner-body-ink': rgbToHex(BANNER_BODY_INK),
  '--riv-banner-strong-ink': rgbToHex(BANNER_STRONG_INK),
} as const;

/** The console's two white-surface hairlines, and the sign-out button's hover fill (#887). */
const CONSOLE_FAMILY = {
  '--riv-console-card-border': cssValue(CONSOLE_CARD_BORDER),
  '--riv-console-btn-border': cssValue(CONSOLE_BTN_BORDER),
  '--riv-console-btn-hover': rgbToHex(CONSOLE_BTN_HOVER),
} as const;

/** The literals every migrated site must have stopped painting. */
const MIGRATED_LITERALS = ['#0a2a33', 'rgba(12,42,51,0.1)', 'rgba(12,42,51,0.14)', '#eef1f2'];

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/** The stylesheet's own notation for an alpha token, so the mirror can be compared to the source. */
function cssValue({ color, alpha }: Glass): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

describe('The T-3 re-cut — fixed-fill and role-mismatch ink families (#849)', () => {
  describe('the banner family', () => {
    it.each(BANNER_FILLS.map((fill) => [rgbToHex(fill), fill] as const))(
      'both inks clear AA on the %s banner fill',
      (hex) => {
        expect(contrastRatio(rgbToHex(BANNER_BODY_INK), hex), 'body').toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
        expect(contrastRatio(rgbToHex(BANNER_STRONG_INK), hex), 'strong').toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      },
    );

    /** The refusal at its sharpest: not merely under AA, but very nearly white on white. */
    it.each(BANNER_FILLS.map((fill) => [rgbToHex(fill), fill] as const))(
      'the candidate card ink would be near-invisible on the %s banner fill',
      (hex) => {
        expect(contrastRatio(rgbToHex(DARK_CARD_INK), hex)).toBeLessThan(1.5);
      },
    );

    /**
     * The eyebrow inks are deliberately NOT in this family — six values across six states is class
     * S's per-state palette. Asserted so the omission reads as a decision: if a later slice folds
     * them in, this is the test that has to be argued with.
     */
    it('leaves the per-state eyebrow inks as literals, a class-S palette this family does not claim', () => {
      expect(read('booking/booking-view.ts')).toMatch(/eyebrowPending: 'text-\[#8a5410\]'/);
    });
  });

  describe('the console border families', () => {
    /**
     * Both hairlines bound an opaque white fill, so there is no compositing and no per-theme case:
     * one plain pair each. Non-text chrome under WCAG 1.4.11 — measured rather than assumed
     * exempt, `non-text-contrast.md`'s second condition.
     */
    it.each([
      ['the card border', CONSOLE_CARD_BORDER, 1.21],
      ['the button border', CONSOLE_BTN_BORDER, 1.32],
    ] as const)('%s is measured against the white fill it bounds', (_name, border, expected) => {
      expect(inkRatio(border, WHITE)).toBeCloseTo(expected, 2);
    });

    /**
     * Both are far under 3:1, which is the whole reason they owe a recorded ground rather than an
     * assumption. The tab pill and the sign-out button are controls whose own labels carry the
     * identity — `non-text-contrast.md` rule 2. The card border's other consumer, the "Venue not
     * found" card, is a `<div>`: outside 1.4.11 rather than exempt under it, since nothing about
     * that card is identified by its hairline.
     */
    it('records that neither hairline reaches the 1.4.11 bar, so the exemption is load-bearing', () => {
      expect(inkRatio(CONSOLE_CARD_BORDER, WHITE)).toBeLessThan(AA_LARGE);
      expect(inkRatio(CONSOLE_BTN_BORDER, WHITE)).toBeLessThan(AA_LARGE);
    });

    /**
     * The role objection, made mechanical. These two tokens must not BE the coincidental ones —
     * if a later slice collapses them back onto `--riv-pop-divider` or `--riv-chip-border`, the
     * console inherits the popover's and the tourist chip's theme overrides, which is the whole
     * thing #849's re-cut refused.
     */
    it('keeps the coincidental tokens themed and separate, which is why these exist', () => {
      expect(declarationsOf('--riv-pop-divider')).toHaveLength(2);
      expect(declarationsOf('--riv-chip-border')).toHaveLength(3);
    });
  });

  describe('the console button hover fill (#887)', () => {
    const HOVER = rgbToHex(CONSOLE_BTN_HOVER);

    /**
     * Condition 1 of `non-text-contrast.md` rule 2, on the fill the rule is being claimed for
     * rather than on the resting one: the button's own label is what identifies it, so the two
     * sub-3:1 boundaries below are decorative. Measured on the HOVERED fill because that is the
     * state whose ground this slice is recording.
     */
    it('the label carries the identity at AA on the hovered fill', () => {
      expect(contrastRatio(rgbToHex(INK_DARK), HOVER)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(rgbToHex(INK_DARK), HOVER)).toBeCloseTo(13.29, 2);
    });

    /**
     * Condition 2, and the reason this slice exists rather than being a rename: a hover fill forms
     * two boundaries — against the state it replaces and against the surface it sits on — and
     * neither reaches 3:1. Pinned as measurements, so a later sweep reading them as a violation
     * this slice introduced can see they were never anything else (#879's close-sales lesson).
     */
    it('records that the hover state does not reach the 1.4.11 bar, so the exemption is load-bearing', () => {
      expect(contrastRatio(HOVER, rgbToHex(WHITE))).toBeCloseTo(1.14, 2);
      expect(contrastRatio(HOVER, rgbToHex(WHITE))).toBeLessThan(AA_LARGE);

      for (const stop of PORCELAIN_STOPS) {
        const glass = rgbToHex(surfaceOver(PORCELAIN_HEADER_GLASS, stop));
        const ratio = contrastRatio(HOVER, glass);

        expect(ratio, `over ${glass}`).toBeLessThan(AA_LARGE);
        expect(ratio, `over ${glass}`).toBeGreaterThanOrEqual(1.04);
        expect(ratio, `over ${glass}`).toBeLessThanOrEqual(1.14);
      }
    });

    /**
     * The hover delta stated as a COMPARISON rather than a threshold, the shape the calendar's
     * merged disabled alphas already use here: a bare "1.14:1" would be equally true of a value
     * this skin should not have, and prose carrying it would go stale silently. Both sides are
     * read from the stylesheet, so the claim `non-text-contrast.md` makes — that this state
     * separates at least as well as the settled family one layer over — cannot drift from it.
     */
    it('separates from its resting fill at least as well as the settled solid-btn family does', () => {
      const solidDelta = contrastRatio(
        declarationsOf('--riv-solid-btn-fill')[0],
        declarationsOf('--riv-solid-btn-hover')[0],
      );

      expect(contrastRatio(HOVER, rgbToHex(WHITE))).toBeGreaterThan(solidDelta);
    });

    /**
     * The refusal, made mechanical — the same shape as "leaves the three candidate tokens exactly
     * as it found them" above. `--riv-solid-btn-{fill,hover}` is the same skin one layer over, and
     * collapsing onto it would be a REPAINT: its resting fill is not this button's, so the merge
     * moves two positions rather than migrating one. Without this, "we gave the console button its
     * own token" and "we quietly adopted the tourist pair" look identical in a diff.
     */
    it('refuses the solid-btn pair on its values, not on assertion', () => {
      expect(declarationsOf('--riv-solid-btn-fill')).toEqual(['#f4f6f7']);
      expect(declarationsOf('--riv-solid-btn-hover')).toEqual(['#e7ebec']);

      expect(declarationsOf('--riv-solid-btn-fill')[0], 'the resting fills differ').not.toBe(
        rgbToHex(WHITE),
      );
      expect(declarationsOf('--riv-solid-btn-hover')[0], 'the hover fills differ').not.toBe(HOVER);
    });

    /**
     * The positive half, token-specific — and it needs to be here rather than left to `the sites`
     * below, whose `%s paints its family` regex this site ALREADY satisfied through the
     * `border-riv-console-btn-border` it carried before this slice. That test is a per-site check
     * that some family is painted; it is structurally unable to say which, so on its own it gave
     * this migration zero signal. Widening its alternation would not have helped: one matching
     * branch satisfies the whole regex.
     */
    it('paints the hover fill through its named utility, not a literal', () => {
      expect(read('operator/operator-actions.ts')).toContain('hover:bg-riv-console-btn-hover');
    });

    /**
     * The other half of the role decision, asserted so the omission reads as one. The button's
     * resting fill stays a Tailwind named colour: it is outside the ledger's population, it is the
     * idiom of every other white surface in this console, and #849 — which tokenised the hairlines
     * bounding exactly these fills — deliberately left the fills alone. A later slice that gives it
     * `--riv-console-btn-fill` has to argue with this test rather than tidy past it.
     */
    it('leaves the resting fill as bg-white, the precedent of the surface it sits on', () => {
      const source = read('operator/operator-actions.ts');

      expect(source, 'the resting fill is still the named colour').toContain('bg-white');
      expect(source, 'no fill token was invented for it').not.toContain('bg-riv-console-btn-fill');
    });
  });

  describe('the stylesheet contract', () => {
    const ALL = { ...BANNER_FAMILY, ...CONSOLE_FAMILY };

    it('declares each token exactly once, so no theme block can override it', () => {
      for (const name of Object.keys(ALL)) {
        expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
      }
    });

    it('declares the family in the base block, where it resolves for all three themes', () => {
      const base = baseBlock();

      for (const name of Object.keys(ALL)) {
        expect(base, `${name} in the base block`).toContain(`${name}:`);
      }
    });

    it('declares the values this test mirror carries', () => {
      for (const [name, value] of Object.entries(ALL)) {
        expect(declarationsOf(name)[0], name).toBe(value);
      }
    });

    it('is mapped in `@theme inline`, without which the utilities never generate', () => {
      for (const name of Object.keys(ALL)) {
        expect(
          declarationsOf(`--color-riv-${name.slice('--riv-'.length)}`),
          `the @theme inline row for ${name}`,
        ).toEqual([`var(${name})`]);
      }
    });

    /**
     * The three tokens the ticket proposed are refused, not retuned: this slice must leave them
     * byte-identical. Without this, "we chose our own tokens instead" and "we quietly widened
     * `--riv-card-ink`" would look the same in a diff.
     */
    it('leaves the three candidate tokens exactly as it found them', () => {
      expect(declarationsOf('--riv-ink')).toEqual(['#0a2a33', '#ffffff', '#ffffff']);
      expect(declarationsOf('--riv-card-ink')).toEqual(['#0a2a33', '#f2f7fa']);
      expect(declarationsOf('--riv-pop-ink')).toEqual(['#0a2a33', '#f2f7fa']);
    });
  });

  describe('the sites', () => {
    const SITES = [
      'booking/booking-view.ts',
      'operator/operator-console.html',
      'operator/operator-actions.ts',
    ];

    it.each(SITES)('%s paints no migrated literal', (path) => {
      const source = read(path).toLowerCase().replaceAll(' ', '');

      for (const literal of MIGRATED_LITERALS) {
        expect(source, `${path} still paints ${literal}`).not.toContain(literal);
      }
    });

    /**
     * The positive half. The sweep above asserts absences, which a mistyped path would satisfy
     * vacuously — #852's emptied-guard lesson, now a standing shape rather than a habit.
     */
    it.each(SITES)('%s paints its family', (path) => {
      expect(read(path), `${path} paints a re-cut family`).toMatch(
        /-riv-(banner|console-card-border|console-btn-border)-?/,
      );
    });
  });
});

/** The ratio of an alpha ink against the surface it is composited onto. */
function inkRatio({ color, alpha }: Glass, surface: Rgb): number {
  return contrastRatio(rgbToHex(composite(color, alpha, surface)), rgbToHex(surface));
}
