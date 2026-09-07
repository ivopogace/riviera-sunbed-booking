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
  CONSOLE_CARD_BORDER,
  DARK_CARD_INK,
  Glass,
  WHITE,
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

/** The console's white-surface hairline. Its siblings — the sign-out button's border and hover
 *  fill — retired with that button when the account chip folded sign-out into a popover row. */
const CONSOLE_FAMILY = {
  '--riv-console-card-border': cssValue(CONSOLE_CARD_BORDER),
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

  describe('the console border family', () => {
    /**
     * The hairline bounds an opaque white fill, so there is no compositing and no per-theme case:
     * one plain pair. Non-text chrome under WCAG 1.4.11 — measured rather than assumed exempt,
     * `non-text-contrast.md`'s second condition.
     */
    it('the card border is measured against the white fill it bounds', () => {
      expect(inkRatio(CONSOLE_CARD_BORDER, WHITE)).toBeCloseTo(1.21, 2);
    });

    /**
     * Far under 3:1, which is the whole reason it owes a recorded ground rather than an assumption.
     * Its one consumer, the "Venue not found" card, is a `<div>`: outside 1.4.11 rather than exempt
     * under it, since nothing about that card is identified by its hairline.
     */
    it('records that the hairline does not reach the 1.4.11 bar, so the exemption is load-bearing', () => {
      expect(inkRatio(CONSOLE_CARD_BORDER, WHITE)).toBeLessThan(AA_LARGE);
    });

    /**
     * The role objection, made mechanical. This token must not BE the coincidental ones — if a
     * later slice collapses it back onto `--riv-pop-divider` or `--riv-chip-border`, the console
     * inherits the popover's and the tourist chip's theme overrides, which is the whole thing
     * the re-cut refused (`docs/design/colour-literal-token-audit.md`, class R).
     */
    it('keeps the coincidental tokens themed and separate, which is why this exists', () => {
      expect(declarationsOf('--riv-pop-divider')).toHaveLength(2);
      expect(declarationsOf('--riv-chip-border')).toHaveLength(3);
    });

    /** The retired siblings stay retired: a re-declaration is a re-decision, argued here first. */
    it('declares neither of the retired sign-out button tokens', () => {
      expect(declarationsOf('--riv-console-btn-border')).toHaveLength(0);
      expect(declarationsOf('--riv-console-btn-hover')).toHaveLength(0);
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
    const SITES = ['booking/booking-view.ts', 'operator/operator-console.html'];

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
        /-riv-(banner|console-card-border)-?/,
      );
    });
  });
});

/** The ratio of an alpha ink against the surface it is composited onto. */
function inkRatio({ color, alpha }: Glass, surface: Rgb): number {
  return contrastRatio(rgbToHex(composite(color, alpha, surface)), rgbToHex(surface));
}
