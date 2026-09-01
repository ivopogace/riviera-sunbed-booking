import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_LARGE, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CTA_BORDER,
  CTA_GRAD_STOPS,
  DARK_CARD_BORDER,
  DARK_CARD_GLASS,
  DARK_STOPS,
  DIALOG_CLOSE_FILL,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-cta-border` (#853, class R row 1 of the colour-literal audit) — the white
 * hairline bevel on the primary CTA button, worn at 16 positions across `auth/`, `booking/` and
 * `shared/`.
 *
 * <p><strong>Why its own token and not `--riv-inset-fill`.</strong> The value coincides exactly,
 * the role does not: that one is a FILL, and it resolves `rgba(255,255,255,0.08)` in the dark
 * theme. Pointing a border at it would be the role confusion class R exists to name, and it would
 * move the dark-theme paint of every one of these buttons.
 *
 * <p><strong>Why theme-invariant, against the issue's own suggestion.</strong> #853 proposed
 * `--riv-card-border` as the precedent for "how such a border themes". It is not: that token
 * themes because the card glass UNDER it themes. Every surface here is fixed — `--riv-cta-grad`
 * is declared once in the base block and inherited by all three themes, and `booking-dialog`'s
 * close button sits on a `#31798a` literal. So the class-F rule applies in the usual direction:
 * a fixed surface pins everything painted on it. The themed-alternative test carries the measured
 * bound that makes this a decision rather than an omission.
 *
 * <p><strong>Why the family includes the close button.</strong> Grouped by FORM, not by value or
 * by component — a white hairline bevel on a fixed teal action surface. Both grounds for
 * invariance are the same, so one token rather than two one-hyphen-apart names (#864's argument).
 *
 * <p>What jsdom maths cannot see is a dark override added later — every ratio here would still
 * pass. So the declaration tests read `src/tailwind.css` as text via `testing/stylesheet-tokens`.
 * The proof where the cascade rather than a regex decides is `e2e/cta-border-token-skin.e2e.ts`.
 */
const REGISTRY = {
  '--riv-cta-border': 'rgba(255, 255, 255, 0.4)',
} as const;

/** Every fixed surface the hairline lands on: the CTA gradient's two stops, then the close button. */
const FIXED_FILLS = [
  ['--riv-cta-grad top stop', CTA_GRAD_STOPS[0]],
  ['--riv-cta-grad bottom stop', CTA_GRAD_STOPS[1]],
  ['booking-dialog close button', DIALOG_CLOSE_FILL],
] as const;

/**
 * Every theme's card glass with the background stops it composites over — the hosts a CTA button
 * sits on. The light two are the population the #853 affordance test already used; #876 adds the
 * dark theme, whose numbers had lived only in prose until then.
 */
const THEMED_CARD_GLASS = [
  ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
  ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS],
  ['dark', DARK_CARD_GLASS, DARK_STOPS],
] as const;

/**
 * The literal positions this slice retires. Swept as UTILITY strings rather than bare values, the
 * `booking-dialog` form: the same `rgba(255,255,255,0.4)` survives in the tree inside composite
 * `inset` shadows, a different role that class R does not own.
 */
const RETIRED_POSITIONS: readonly string[] = [
  'border-[rgba(255,255,255,0.4)]',
  'bg-[rgba(255,255,255,0.4)]',
];

/**
 * The home of this value the slice deliberately leaves alone, asserted POSITIVELY — the
 * `OUT_OF_FAMILY` mechanism, the only thing able to show the sweep did not over-reach.
 * `app.html`'s theme chip carries the value as the inner highlight of a composite shadow: one
 * member of a 0.4/0.5/0.7 ramp used in the same idiom tree-wide, so tokenising it alone would be
 * the partial cut the audit ledger warns against. It has its own ledger row instead.
 */
const OUT_OF_FAMILY = { path: 'app.html', literal: 'inset_0_1px_0_rgba(255,255,255,0.4)' } as const;

const APP_ROOT = join(process.cwd(), 'src/app');
const SRC_ROOT = join(process.cwd(), 'src');

/**
 * The #834 citations that record what that issue actually completed — the erasure panel's Erase
 * button, raised to 3:1 by PR #837 — rather than deferring anything to it. Each is pinned by a
 * distinguishing phrase, not by filename, so a new deferral written into one of these files still
 * fails the guard (#876 risk R-2).
 */
const HISTORICAL_834: readonly { path: string; phrase: string }[] = [
  { path: 'tailwind.css', phrase: '>=3:1 against the panel fill, all porcelain stops' },
  { path: 'tailwind.css', phrase: 'the same per-theme tuning --riv-danger-action-border got' },
  { path: 'testing/glass-tokens.ts', phrase: "see the contrast spec's header" },
  { path: 'app/admin/admin-console.contrast.spec.ts', phrase: 'deliberately left unasserted' },
];

/** This file, the one source that may legitimately name the retired positions — it is the sweep. */
const SELF = 'shared/cta-border-token.contrast.spec.ts';

/**
 * Every source under `src/app` except this one — templates are inline `.ts` here, so both
 * extensions are swept, and specs are IN scope: #862 found stale token prose hiding in a spec file
 * that a `*.spec.ts`-excluding sweep could not see.
 */
function allSources(): readonly string[] {
  return readdirSync(APP_ROOT, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && path.replaceAll('\\', '/') !== SELF,
  );
}

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/**
 * Every file that can carry a token comment, addressed relative to `src` — the `src/app` tree plus
 * the two homes outside it that the token prose actually lives in. A sweep scoped to `src/app`
 * would have missed both, which is where all six deferring families sit.
 */
function sweptSources(): readonly { path: string; text: string }[] {
  const paths = [
    ...allSources().map((path) => `app/${path.replaceAll('\\', '/')}`),
    'tailwind.css',
    'testing/glass-tokens.ts',
  ];

  return paths.map((path) => ({ path, text: readFileSync(join(SRC_ROOT, path), 'utf8') }));
}

/** Every line naming `citation`, across the swept sources. */
function citationsOf(citation: string): readonly { path: string; line: string }[] {
  return sweptSources().flatMap(({ path, text }) =>
    text
      .split('\n')
      .filter((line) => line.includes(citation))
      .map((line) => ({ path, line })),
  );
}

/** The hairline as it actually paints: composited over the opaque fill it sits on. */
function borderOver(fill: readonly [number, number, number], alpha: number): number {
  const painted = composite([255, 255, 255], alpha, fill);
  return contrastRatio(rgbToHex(painted), rgbToHex(fill));
}

describe('--riv-cta-border — the CTA hairline (#853)', () => {
  it('is declared exactly once, so no theme can override it', () => {
    for (const name of Object.keys(REGISTRY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('is declared in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(REGISTRY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the value this test mirror carries', () => {
    for (const [name, value] of Object.entries(REGISTRY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('sits on a gradient that is itself declared once — the ground for invariance', () => {
    expect(declarationsOf('--riv-cta-grad')).toHaveLength(1);
  });

  it('is decorative chrome, measured rather than assumed exempt', () => {
    for (const [surface, fill] of FIXED_FILLS) {
      const ratio = borderOver(fill, CTA_BORDER.alpha);
      expect(ratio, `${surface}: WCAG 1.4.11 exemption`).toBeLessThan(AA_LARGE);
      expect(ratio, `${surface}: the measured band's floor`).toBeGreaterThan(2);
    }
  });

  it('is not the affordance boundary — the fill carries it, in both light themes', () => {
    const glasses = [
      ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
      ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS],
    ] as const;

    for (const [theme, glass, stops] of glasses) {
      for (const stop of stops) {
        const behind = surfaceOver(glass, stop);
        for (const fill of CTA_GRAD_STOPS) {
          expect(
            contrastRatio(rgbToHex(fill), rgbToHex(behind)),
            `${theme} over stop ${rgbToHex(stop)}`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        }
      }
    }
  });

  /**
   * #876's correction, and the reason no palette change was needed. The ticket measured the CTA
   * fill against the card glass and read 2.23-3.16:1 in the dark theme as a 1.4.11 failure — but
   * the hairline sits BETWEEN those two, so that pairing is not an adjacency. Measured against the
   * colour each layer actually abuts, the boundary clears 3:1 in every theme, and WHICH layer
   * carries it swaps: the fill is a fixed mid-teal, so light glass makes the fill the contrasting
   * half and dark glass makes the white hairline it. Rule 1 of docs/design/non-text-contrast.md.
   */
  it('the boundary against the host card clears 3:1 in every theme — the fill carries it in light, the hairline in dark', () => {
    for (const [theme, glass, stops] of THEMED_CARD_GLASS) {
      for (const stop of stops) {
        const behind = surfaceOver(glass, stop);
        for (const fill of CTA_GRAD_STOPS) {
          const byFill = contrastRatio(rgbToHex(fill), rgbToHex(behind));
          const hairline = composite([255, 255, 255], CTA_BORDER.alpha, fill);
          const byHairline = contrastRatio(rgbToHex(hairline), rgbToHex(behind));
          expect(
            Math.max(byFill, byHairline),
            `${theme} over stop ${rgbToHex(stop)}: neither the fill (${byFill.toFixed(2)}) nor the hairline (${byHairline.toFixed(2)}) abuts the card at 3:1`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
          expect(
            theme === 'dark' ? byHairline : byFill,
            `${theme} over stop ${rgbToHex(stop)}: the expected carrier for this theme`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        }
      }
    }
  });

  /**
   * The number #876 reported, kept under assertion rather than deleted as wrong — it is real, and
   * a future slice re-deriving it should find the pairing already named. What it is NOT is the
   * 1.4.11 comparison: the test above measures the adjacency.
   */
  it('the fill-vs-glass pairing #876 reported is not the adjacent pair', () => {
    const [, darkGlass, darkStops] = THEMED_CARD_GLASS.find(([theme]) => theme === 'dark')!;
    const ratios = darkStops.flatMap((stop) =>
      CTA_GRAD_STOPS.map((fill) =>
        contrastRatio(rgbToHex(fill), rgbToHex(surfaceOver(darkGlass, stop))),
      ),
    );
    expect(Math.min(...ratios), 'the worst stop, which is what falls under 3:1').toBeLessThan(
      AA_LARGE,
    );
    expect(Math.min(...ratios), "the band's floor").toBeGreaterThan(2.2);
    expect(Math.max(...ratios), "the band's ceiling").toBeLessThan(3.2);
  });

  /**
   * #876: the sub-3:1 chrome question had been deferred four times to #834, an issue scoped to the
   * erasure panel that closed 2026-08-31 — so every deferral pointed at a closed issue. The rule
   * now lives at docs/design/non-text-contrast.md, which cannot close. Citations recording what
   * #834 actually completed are history and stay; each is named below, so a fresh deferral cannot
   * be absorbed by appending a filename.
   */
  it('no token comment defers a live 1.4.11 question to the closed #834', () => {
    const offenders = citationsOf('#834').filter(
      ({ path, line }) => !HISTORICAL_834.some((e) => e.path === path && line.includes(e.phrase)),
    );

    expect(offenders.map(({ path, line }) => `${path}: ${line.trim()}`)).toEqual([]);
  });

  /**
   * The precondition rule 3 of docs/design/non-text-contrast.md rests on: the exempt families all
   * paint a real `border`, and nothing opts out of forced-colors, so the user agent repaints those
   * boundaries in OS high-contrast mode whatever alpha we chose. If this ever goes red, that clause
   * is void for the opted-out surface and rule 2 has to carry the exemption alone.
   */
  it('nothing opts out of forced-colors, which is what the fallback clause rests on', () => {
    const optOuts = sweptSources().filter(({ text }) =>
      /forced-color-adjust(-none|:\s*none)/.test(text),
    );

    expect(optOuts.map(({ path }) => path)).toEqual([]);
  });

  it('a themed border would fade over fills that do not theme', () => {
    for (const [surface, fill] of FIXED_FILLS) {
      expect(borderOver(fill, DARK_CARD_BORDER.alpha), surface).toBeLessThanOrEqual(1.5);
    }
  });

  it('leaves no component painting the retired literal positions', () => {
    const offenders = allSources().filter((path) =>
      RETIRED_POSITIONS.some((position) => read(path).includes(position)),
    );

    expect(offenders).toEqual([]);
  });

  it('leaves the inset-highlight ramp alone, which is a different family', () => {
    expect(read(OUT_OF_FAMILY.path)).toContain(OUT_OF_FAMILY.literal);
  });
});
