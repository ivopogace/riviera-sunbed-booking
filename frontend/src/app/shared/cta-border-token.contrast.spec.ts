import { readFileSync } from 'node:fs';
import { recursivePaths } from '../../testing/source-paths';
import { join } from 'node:path';

import {
  AA_LARGE,
  AA_NORMAL,
  composite,
  contrastRatio,
  relativeLuminance,
  rgbToHex,
  type Rgb,
} from '../../testing/contrast';
import {
  BANNER_FILLS,
  CTA_BORDER,
  CTA_GRAD_STOPS,
  DARK_CARD_BORDER,
  DARK_CARD_GLASS,
  DARK_DIALOG_GLASS,
  DARK_FIELD_SOLID,
  DARK_HEADER_GLASS,
  DARK_POP_SURFACE,
  DARK_STOPS,
  DIALOG_CLOSE_FILL,
  type Glass,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  WORST_PHOTOS,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf, themeBlock } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-cta-border` (class R row 1 of the colour-literal audit) — the white
 * hairline bevel on the primary CTA button, worn through `shared/primary-cta.ts`'s
 * `[appPrimaryCta]` skin (and on `booking-dialog`'s close button).
 *
 * <p><strong>Why its own token and not `--riv-inset-fill`.</strong> The value coincides exactly,
 * the role does not: that one is a FILL, and it resolves `rgba(255,255,255,0.08)` in the dark
 * theme. Pointing a border at it would be the role confusion class R exists to name, and it would
 * move the dark-theme paint of every one of these buttons.
 *
 * <p><strong>Why theme-invariant, not modelled on `--riv-card-border`.</strong> That token looks
 * like the precedent for "how such a border themes". It is not: that token
 * themes because the card glass UNDER it themes. Every surface here is fixed — `--riv-cta-grad`
 * is declared once in the base block and inherited by all three themes, and `booking-dialog`'s
 * close button sits on a `#31798a` literal. So the class-F rule applies in the usual direction:
 * a fixed surface pins everything painted on it. The themed-alternative test carries the measured
 * bound that makes this a decision rather than an omission.
 *
 * <p><strong>Why the family includes the close button.</strong> Grouped by FORM, not by value or
 * by component — a white hairline bevel on a fixed teal action surface. Both grounds for
 * invariance are the same, so one token rather than two one-hyphen-apart names.
 *
 * <p>What jsdom maths cannot see is a dark override added later — every ratio here would still
 * pass. So the declaration tests read `src/tailwind.css` as text via `testing/stylesheet-tokens`.
 * The proof where the cascade rather than a regex decides is `e2e/cta-border-token-skin.e2e.ts`.
 *
 * <p><strong>Scope wider than this one token.</strong> Two tests here are TREE-WIDE
 * governance for `docs/design/non-text-contrast.md` rather than guards on `--riv-cta-border`: one
 * sweeps `src` for a comment deferring to the closed erasure-panel contrast issue, the other sweeps
 * for a `forced-color-adjust` opt-out, which is the precondition rule 3 rests on. They live here
 * because this file already owned the source-sweep machinery (`allSources`, extended to
 * `sweptSources`), so a reader who trips one of them is in the right file — but the failure will
 * name a path anywhere in the tree, not this token. That widening is stated here deliberately,
 * the call `admin-console.contrast.spec.ts` made when it took on 1.4.11 rows past its text pairs.
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
 * sits on. The light two are the population the affordance test uses; the dark theme is here too,
 * so its numbers are asserted rather than left in prose.
 */
const THEMED_CARD_GLASS = [
  ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
  ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS],
  ['dark', DARK_CARD_GLASS, DARK_STOPS],
] as const;

/** Real content (a photo, the map) can pass under these hosts, so they are measured over its extremes too. */
const UNDER_CONTENT = [...DARK_STOPS, ...WORST_PHOTOS] as const;

/**
 * A dark surface the CTA stands on (#1845): the glass layers between the page and the button,
 * outermost first, over the grounds they can sit on. A scrim under a dialog, popover or sheet is
 * left out: it only darkens the host, which raises the fill's ratio, so omitting it is the
 * conservative number. `sites` are call-site files; the sweep below fails on a file on no host.
 */
interface DarkHost {
  readonly host: string;
  readonly layers: readonly Glass[];
  readonly grounds: readonly Rgb[];
  readonly sites: readonly string[];
  /** The fill-vs-host band, to two decimals. */
  readonly band: readonly [number, number];
  /** Whether a fill lightened to 3:1 against this host would still keep the white label at AA. */
  readonly lighterFillKeepsLabel: boolean;
}

const DARK_HOSTS: readonly DarkHost[] = [
  {
    host: 'H1 card glass',
    layers: [DARK_CARD_GLASS],
    grounds: DARK_STOPS,
    sites: [
      'auth/auth-page.ts',
      'auth/forgot-password.ts',
      'auth/set-password.ts',
      'auth/reset-password.ts',
      'auth/operator-password.ts',
      'pages/for-venues/for-venues.html',
      'pages/page-load-failed/page-load-failed.ts',
      'booking/request-confirmation.ts',
      'booking/booking-confirmation.ts',
      'booking/booking-pay.ts',
      'booking/manage-booking-link.ts',
      'booking/my-bookings.ts',
      'venue/venue-reviews.ts',
      'venue/venue-map.html',
      'admin/admin-operators.ts',
      'operator/operator-home.ts',
      'operator/venue-create-card.html',
      'operator/layout-editor.html',
      'operator/daily-view-tab.html',
      'operator/set-editor.html',
    ],
    band: [2.23, 3.16],
    lighterFillKeepsLabel: true,
  },
  {
    host: 'H2 card glass, then the --riv-field-solid banner',
    layers: [DARK_CARD_GLASS, DARK_FIELD_SOLID],
    grounds: DARK_STOPS,
    sites: ['venue/venue-map.html', 'venue/stay-plan.ts'],
    band: [2.44, 3.21],
    lighterFillKeepsLabel: true,
  },
  {
    host: 'H3 --riv-dialog-glass',
    layers: [DARK_DIALOG_GLASS],
    grounds: DARK_STOPS,
    sites: ['booking/booking-dialog.ts', 'booking/find-booking.ts'],
    band: [2.33, 3.15],
    lighterFillKeepsLabel: true,
  },
  {
    host: 'H5 the floating --riv-pop-surface pick bar, over the map',
    layers: [DARK_POP_SURFACE],
    grounds: UNDER_CONTENT,
    sites: ['venue/venue-map.html'],
    band: [2.17, 3.16],
    lighterFillKeepsLabel: true,
  },
  {
    host: "H6 --riv-header-glass, then the failure panel's card glass",
    layers: [DARK_HEADER_GLASS, DARK_CARD_GLASS],
    grounds: UNDER_CONTENT,
    sites: ['pages/home/home.html'],
    band: [2.17, 3.16],
    lighterFillKeepsLabel: true,
  },
  {
    host: 'H7 the console bottom sheet below lg, card glass over the console scrim',
    layers: [DARK_CARD_GLASS],
    grounds: DARK_STOPS,
    sites: ['operator/set-editor.html'],
    band: [2.23, 3.16],
    lighterFillKeepsLabel: true,
  },
  {
    host: 'H8 the sticky card-glass save bar, over the scrolling page',
    layers: [DARK_CARD_GLASS],
    grounds: UNDER_CONTENT,
    sites: ['operator/venue-tab.html', 'operator/layout-editor.html'],
    band: [1.58, 3.25],
    lighterFillKeepsLabel: false,
  },
];

/**
 * H4, the popover (`--riv-pop-surface`): the calendar's Apply and the partly-free sheet's retry.
 * Its number lives in `availability-calendar.contrast.spec.ts`, which measures the popover surface
 * both sheets wear; the sources below are held to that surface.
 */
const POPOVER_HOST = {
  measuredIn: 'shared/availability-calendar.contrast.spec.ts',
  sites: ['shared/availability-calendar.html', 'venue/partly-free-sheet.ts'],
} as const;

/** H9: booking-view's Pay now stands on the awaiting banner's fixed `#ddf4f8`, in every theme. */
const LIGHT_BANNER_HOST = {
  site: 'booking/booking-view.ts',
  fill: BANNER_FILLS[0],
} as const;

/** The two sources that define the skin rather than stand a CTA on a host. */
const SKIN_SOURCES = ['shared/primary-cta.ts', 'shared/retry-button.ts'];

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
 * `shared/popover-skin.ts`'s chip glass (the tourist header's menu button and both account chips)
 * carries the value as the inner highlight of a composite shadow: one member of a 0.4/0.5/0.7 ramp used in the same idiom
 * tree-wide, so tokenising it alone would be the partial cut the audit ledger warns against. It
 * has its own ledger row instead.
 */
const OUT_OF_FAMILY = {
  path: 'shared/popover-skin.ts',
  literal: 'inset_0_1px_0_rgba(255,255,255,0.4)',
} as const;

const APP_ROOT = join(process.cwd(), 'src/app');
const SRC_ROOT = join(process.cwd(), 'src');

/**
 * The citations of the closed erasure-panel issue that record what it completed — the erasure
 * panel's Erase button, raised to 3:1 — rather than deferring anything to it. Each is pinned by a
 * distinguishing phrase, not by filename, so a new deferral written into one of these files still
 * fails the guard.
 */
const HISTORICAL_834: readonly { path: string; phrase: string }[] = [
  { path: 'tailwind.css', phrase: '>=3:1 against the panel fill, all porcelain stops' },
  { path: 'tailwind.css', phrase: 'the same per-theme tuning --riv-danger-action-border got' },
  { path: 'testing/glass-tokens.ts', phrase: "see the contrast spec's header" },
  { path: 'app/admin/admin-console.contrast.spec.ts', phrase: 'deliberately left unasserted' },
];

/** The one directive that paints the primary CTA skin, and the utilities that make it this proof's. */
const SKIN = {
  path: 'shared/primary-cta.ts',
  utilities: ['border', 'border-riv-cta-border', 'bg-(image:--riv-cta-grad)', 'text-white'],
} as const;

/** This file, the one source that may legitimately name the retired positions — it is the sweep. */
const SELF = 'shared/cta-border-token.contrast.spec.ts';

/**
 * Every source under `src/app` except this one — templates are inline `.ts` here, so both
 * extensions are swept, and specs are IN scope: stale token prose has hidden in a spec file
 * that a `*.spec.ts`-excluding sweep could not see.
 */
function allSources(): readonly string[] {
  return recursivePaths(APP_ROOT).filter((path) => /\.(ts|html)$/.test(path) && path !== SELF);
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

/** The `[appPrimaryCta]` host class, as the utilities it carries. */
function skinUtilities(): readonly string[] {
  return /class:\s*'([^']*)'/.exec(read(SKIN.path))?.[1].split(/\s+/) ?? [];
}

/** The CTA fill against the dark card glass, over every dark stop and both gradient stops. */
function darkFillAgainstCard(): readonly number[] {
  return DARK_STOPS.flatMap((stop) =>
    CTA_GRAD_STOPS.map((fill) =>
      contrastRatio(rgbToHex(fill), rgbToHex(surfaceOver(DARK_CARD_GLASS, stop))),
    ),
  );
}

/** A host's painted colour over one ground: each glass layer composited over the one below. */
function hostOver(layers: readonly Glass[], ground: Rgb): Rgb {
  return layers.reduce<Rgb>((below, glass) => surfaceOver(glass, below), ground);
}

/** The CTA fill against a dark host, over every ground it can sit on and both gradient stops. */
function fillAgainst({ layers, grounds }: DarkHost): readonly number[] {
  return grounds.flatMap((ground) =>
    CTA_GRAD_STOPS.map((fill) => contrastRatio(rgbToHex(fill), rgbToHex(hostOver(layers, ground)))),
  );
}

/** White on the fill a host would need for 3:1 against its lightest composite: the untaken option. */
function labelAtLighterFill({ layers, grounds }: DarkHost): number {
  const lightest = Math.max(
    ...grounds.map((ground) => relativeLuminance(rgbToHex(hostOver(layers, ground)))),
  );
  return 1.05 / (AA_LARGE * (lightest + 0.05));
}

/** Every call-site file standing a CTA on a host: an element wearing the skin, or a retry button. */
function ctaSites(): readonly string[] {
  return allSources()
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => !path.endsWith('.spec.ts') && !SKIN_SOURCES.includes(path))
    .filter((path) => /<(?:button|a)\b[^>]*\bappPrimaryCta\b|<app-retry-button\s/.test(read(path)));
}

/** A fill under the skin's hover `brightness()`, which multiplies each sRGB channel. */
function hovered(fill: Rgb): Rgb {
  const utility = skinUtilities().find((name) => name.includes('brightness-['));
  const factor = Number(/brightness-\[([\d.]+)\]/.exec(utility ?? '')?.[1]);
  const lift = (channel: number): number => Math.min(255, Math.round(channel * factor));

  return [lift(fill[0]), lift(fill[1]), lift(fill[2])];
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
   * Rule 1 of docs/design/non-text-contrast.md, the PROJECT'S reading: the layer that abuts the
   * card is the boundary, and which layer clears 3:1 swaps by theme. The W3C page does not state
   * it, so the dark CTA does not rest on this test: rule 2's conditions, asserted below, carry it.
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
   * What a reader who subsumes the hairline into the fill (the Understanding page's "subsumed"
   * sentence) measures. Rule 2's second condition for the CTA: the number stays under assertion.
   */
  it('the dark fill-vs-card pairing #876 reported is measured: under 3:1 at the worst stop', () => {
    const ratios = darkFillAgainstCard();
    expect(Math.min(...ratios), 'the worst stop, which is what falls under 3:1').toBeLessThan(
      AA_LARGE,
    );
    expect(Math.min(...ratios), "the band's floor").toBeGreaterThan(2.2);
    expect(Math.max(...ratios), "the band's ceiling").toBeLessThan(3.2);
  });

  /**
   * Rule 2 of docs/design/non-text-contrast.md, for the CTA (#1840): the label carries the
   * identity at AA, the boundary's number is measured, and the skin paints a real `border`.
   */
  it("meets rule 2's three conditions: an AA label resting and hovered, a measured boundary, a real border", () => {
    for (const fill of CTA_GRAD_STOPS) {
      for (const [state, painted] of [
        ['resting', fill],
        ['hovered', hovered(fill)],
      ] as const) {
        expect(
          contrastRatio('#ffffff', rgbToHex(painted)),
          `white label over ${rgbToHex(fill)}, ${state}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
    expect(hovered(CTA_GRAD_STOPS[0]), 'the hover factor is read off the skin').not.toEqual(
      CTA_GRAD_STOPS[0],
    );

    for (const host of DARK_HOSTS) {
      expect(Math.min(...fillAgainst(host)), `${host.host}: the measured boundary`).toBeLessThan(
        AA_LARGE,
      );
    }

    expect(skinUtilities(), 'a real border').toEqual(
      expect.arrayContaining(['border', 'border-riv-cta-border']),
    );
  });

  /**
   * The option #1840 did not take, kept measured so the doc's corollary cannot go stale: a fill
   * light enough for 3:1 against the lightest dark card still leaves white text at AA.
   */
  it('a lighter dark fill could clear 3:1 and keep the label at AA, which is why leaving it is a choice', () => {
    const lightestCard = Math.max(
      ...DARK_STOPS.map((stop) => relativeLuminance(rgbToHex(surfaceOver(DARK_CARD_GLASS, stop)))),
    );
    const fillFloor = AA_LARGE * (lightestCard + 0.05) - 0.05;
    const labelAtFloor = 1.05 / (fillFloor + 0.05);

    expect(labelAtFloor).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(labelAtFloor, 'the margin is thin').toBeLessThan(5.5);
  });

  /**
   * Rule 2's second condition wherever the button stands in the dark theme (#1845): each host's
   * fill-vs-host band is asserted, so the doc's "in the dark theme" is measured, not assumed.
   */
  it.each(DARK_HOSTS)('the dark fill against $host is a measured band', (host) => {
    const ratios = fillAgainst(host);

    expect(Math.min(...ratios), 'the band floor').toBeCloseTo(host.band[0], 2);
    expect(Math.max(...ratios), 'the band ceiling').toBeCloseTo(host.band[1], 2);
  });

  it.each(DARK_HOSTS)('the untaken lighter fill against $host: does the label keep AA?', (host) => {
    const label = labelAtLighterFill(host);

    if (host.lighterFillKeepsLabel) {
      expect(label, 'white on a fill at 3:1 against this host').toBeGreaterThanOrEqual(AA_NORMAL);
    } else {
      expect(label, 'white on a fill at 3:1 against this host').toBeLessThan(AA_NORMAL);
    }
  });

  it('every dark host mirror matches the dark block of the stylesheet', () => {
    const dark = themeBlock('dark');
    const mirrors = [
      ['--riv-card-glass', DARK_CARD_GLASS],
      ['--riv-field-solid', DARK_FIELD_SOLID],
      ['--riv-dialog-glass', DARK_DIALOG_GLASS],
      ['--riv-pop-surface', DARK_POP_SURFACE],
      ['--riv-header-glass', DARK_HEADER_GLASS],
    ] as const;

    for (const [token, { color, alpha }] of mirrors) {
      expect(dark, token).toContain(`${token}: rgba(${color.join(', ')}, ${alpha});`);
    }
  });

  it('every file standing a CTA on a host is named in the dark host population, and only those', () => {
    const named = new Set([
      ...DARK_HOSTS.flatMap((host) => host.sites),
      ...POPOVER_HOST.sites,
      LIGHT_BANNER_HOST.site,
    ]);

    expect([...ctaSites()].sort(), 'a call site no host names').toEqual([...named].sort());
  });

  it('the popover host (H4) is the one surface its measuring spec composites', () => {
    for (const site of POPOVER_HOST.sites) {
      expect(read(site), `${site} wears the popover surface`).toContain('bg-riv-pop-surface');
    }
    expect(read(POPOVER_HOST.measuredIn)).toContain(
      'the Apply rests on rule 2 in the dark palette',
    );
  });

  /**
   * H9 needs no exemption: on the fixed light banner the fill itself clears 3:1, resting and
   * hovered, as it does against the card in the light themes.
   */
  it("on booking-view's fixed light banner (H9) the fill clears 3:1 by itself", () => {
    expect(read(LIGHT_BANNER_HOST.site)).toMatch(/bannerAwaiting:[^\n]*bg-\[#ddf4f8\]/);
    const banner = rgbToHex(LIGHT_BANNER_HOST.fill);

    for (const fill of CTA_GRAD_STOPS) {
      for (const painted of [fill, hovered(fill)]) {
        expect(contrastRatio(rgbToHex(painted), banner), rgbToHex(painted)).toBeGreaterThanOrEqual(
          AA_LARGE,
        );
      }
    }
  });

  /**
   * The sub-3:1 chrome question belongs to docs/design/non-text-contrast.md, which cannot close —
   * not to the erasure-panel issue this test sweeps for, which closed 2026-08-31 and so is a dead
   * end for any deferral. Citations recording what that issue completed are history and stay; each
   * is named in `HISTORICAL_834`, so a fresh deferral cannot be absorbed by appending a filename.
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

  it('the primary CTA skin is the [appPrimaryCta] directive, carrying the proven hairline and fill', () => {
    for (const utility of SKIN.utilities) {
      expect(skinUtilities(), `${SKIN.path} host class`).toContain(utility);
    }
  });

  it('no call site hand-copies the skin: the CTA fill is painted only by the directive', () => {
    const copies = allSources().filter(
      (path) =>
        !path.endsWith('.spec.ts') &&
        path.replaceAll('\\', '/') !== SKIN.path &&
        read(path).includes('bg-(image:--riv-cta-grad)'),
    );

    expect(copies).toEqual([]);
  });

  it('leaves the inset-highlight ramp alone, which is a different family', () => {
    expect(read(OUT_OF_FAMILY.path)).toContain(OUT_OF_FAMILY.literal);
  });
});
