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
import { CALENDAR_BAR, CALENDAR_TINTS } from '../../testing/calendar-tints';
import {
  BANNER_BODY_INK,
  BANNER_FILLS,
  BANNER_STRONG_INK,
  CALENDAR_GLASS,
  CONSOLE_BTN_BORDER,
  CONSOLE_BTN_HOVER,
  CONSOLE_CARD_BORDER,
  CALENDAR_HOVER,
  CALENDAR_INK,
  CALENDAR_INK_DISABLED,
  CALENDAR_INK_FAINT,
  CALENDAR_INK_SOFT,
  DARK_CARD_INK,
  DARK_STOPS,
  Glass,
  INK_DARK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the four fixed-fill and role-mismatch ink families, and for the refusal that defines
 * them: none of these sites can take `--riv-ink`, `--riv-card-ink` or `--riv-pop-ink`, because
 * every one sits on a fill that does not theme. The three agree in porcelain and diverge in dark,
 * so the failure is invisible to any porcelain-only check — which is why it is measured here
 * rather than asserted.
 *
 * <p>Lives in `shared/` because the population spans `venue/`, `booking/` and `operator/`, the same
 * reason as `warn-token-skin.contrast.spec.ts`. The complementary proof, where the cascade rather
 * than a regex decides, is `e2e/fixed-ink-token-recut.e2e.ts`.
 *
 * <p>Rationale: `docs/design/colour-literal-token-audit.md` (class T-3).
 */

/** The calendar's own popover surface and the dark-ink ramp it pins. */
const CALENDAR_FAMILY = {
  '--riv-calendar-glass': cssValue(CALENDAR_GLASS),
  '--riv-calendar-ink': rgbToHex(CALENDAR_INK),
  '--riv-calendar-ink-soft': cssValue(CALENDAR_INK_SOFT),
  '--riv-calendar-ink-faint': cssValue(CALENDAR_INK_FAINT),
  '--riv-calendar-ink-disabled': cssValue(CALENDAR_INK_DISABLED),
  '--riv-calendar-hover': cssValue(CALENDAR_HOVER),
} as const;

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

const THEMES: readonly [string, readonly Rgb[]][] = [
  ['riviera', RIVIERA_STOPS],
  ['porcelain', PORCELAIN_STOPS],
  ['dark', DARK_STOPS],
];

/** The literals every migrated site must have stopped painting. */
const MIGRATED_LITERALS = [
  '#0a2a33',
  'rgba(12,42,51,0.78)',
  'rgba(12,42,51,0.72)',
  'rgba(12,42,51,0.4)',
  'rgba(12,42,51,0.35)',
  'rgba(12,42,51,0.07)',
  'rgba(255,255,255,0.97)',
  'rgba(12,42,51,0.1)',
  'rgba(12,42,51,0.14)',
  '#eef1f2',
];

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/** The stylesheet's own notation for an alpha token, so the mirror can be compared to the source. */
function cssValue({ color, alpha }: Glass): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

describe('The T-3 re-cut — fixed-fill and role-mismatch ink families (#849)', () => {
  /** Over the candidates' DARK values: porcelain is where all three agree and hide the fault. */
  describe("the ticket's candidate tokens would fail on every one of these surfaces", () => {
    const CANDIDATES: readonly [string, string][] = [
      ['--riv-card-ink / --riv-pop-ink (dark: #f2f7fa)', rgbToHex(DARK_CARD_INK)],
      ['--riv-ink (riviera and dark: #ffffff)', rgbToHex(WHITE)],
    ];

    describe.each(CANDIDATES)('%s', (_name, ink) => {
      it.each(THEMES)('is below AA on the calendar popover over the %s stops', (_theme, stops) => {
        for (const stop of stops) {
          const surface = rgbToHex(surfaceOver(CALENDAR_GLASS, stop));
          expect(contrastRatio(ink, surface), `over ${surface}`).toBeLessThan(AA_NORMAL);
        }
      });

      it.each(CALENDAR_TINTS)('is below AA on the $name day fill', ({ fill }) => {
        expect(contrastRatio(ink, fill)).toBeLessThan(AA_NORMAL);
      });
    });
  });

  describe('the calendar family', () => {
    it.each(THEMES)(
      'the primary ink clears AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(CALENDAR_INK, 1, CALENDAR_GLASS, stops);
      },
    );

    it.each(THEMES)(
      'the footer note clears AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(CALENDAR_INK_SOFT.color, CALENDAR_INK_SOFT.alpha, CALENDAR_GLASS, stops);
      },
    );

    it.each(THEMES)(
      'the weekday headers clear AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(
          CALENDAR_INK_FAINT.color,
          CALENDAR_INK_FAINT.alpha,
          CALENDAR_GLASS,
          stops,
        );
      },
    );

    /**
     * Clears no bar and need not: every site wearing it is `aria-disabled`, which WCAG 1.4.3
     * exempts as an inactive component. Pinned in BOTH directions so a retune past 3:1 retires the
     * exemption rather than inheriting it, and one toward invisibility fails.
     */
    it.each(THEMES)(
      'the disabled ink stays legible-but-weakened on the %s stops, its whole job',
      (_theme, stops) => {
        for (const stop of stops) {
          const surface = surfaceOver(CALENDAR_GLASS, stop);
          const disabled = inkRatio(CALENDAR_INK_DISABLED, surface);

          expect(disabled, `over ${rgbToHex(stop)}`).toBeGreaterThan(2);
          expect(disabled, `over ${rgbToHex(stop)}`).toBeLessThan(AA_LARGE);
          expect(
            disabled,
            `disabled must read weaker than active over ${rgbToHex(stop)}`,
          ).toBeLessThan(contrastRatio(rgbToHex(CALENDAR_INK), rgbToHex(surface)));
        }
      },
    );

    it.each(CALENDAR_TINTS)('the primary ink clears AA on the $name day fill', ({ fill }) => {
      expect(contrastRatio(rgbToHex(CALENDAR_INK), fill)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /**
     * `#0a3f4e` stays a literal beside these tokens on the month-step buttons, which reads at a
     * glance like a half-migrated pair and is not one: it is the calendar's ACCENT — the same value
     * as every `CALENDAR_TINTS.ring` and the capacity bar's fill — so it is a different family with
     * its own surfaces, not the base branch of this ramp. Asserted so the omission is a decision.
     */
    it('leaves the accent family literal, since it is a different family and not this ramp', () => {
      const source = read('venue/availability-calendar.html');

      expect(source, 'the month-step buttons still paint the accent').toContain('text-[#0a3f4e]');
      expect(CALENDAR_TINTS.every((tint) => tint.ring === '#0a3f4e')).toBe(true);
      expect(CALENDAR_BAR.fill).toBe('#0a3f4e');
    });

    /**
     * The slice's one deliberate repaint, asserted as a comparison rather than a threshold: a
     * threshold would have been true of the losing choice too and would not say why 0.4 was picked.
     */
    it('merges the two disabled alphas at the higher-contrast of them', () => {
      const surface = surfaceOver(CALENDAR_GLASS, PORCELAIN_STOPS[0]);
      const outgoing = { color: CALENDAR_INK_DISABLED.color, alpha: 0.35 };

      expect(inkRatio(CALENDAR_INK_DISABLED, surface)).toBeGreaterThan(inkRatio(outgoing, surface));
    });
  });

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
    const ALL = { ...CALENDAR_FAMILY, ...BANNER_FAMILY, ...CONSOLE_FAMILY };

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
      'venue/availability-calendar.html',
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
        /-riv-(calendar|banner|console-card-border|console-btn-border)-?/,
      );
    });
  });
});

/** The ratio of an alpha ink against the surface it is composited onto. */
function inkRatio({ color, alpha }: Glass, surface: Rgb): number {
  return contrastRatio(rgbToHex(composite(color, alpha, surface)), rgbToHex(surface));
}
