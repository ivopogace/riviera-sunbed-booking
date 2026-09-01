import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { DESCRIPTIVE_CHIPS } from '../../testing/chip-fills';
import {
  AMENITY_TAG_BORDER,
  AMENITY_TAG_FILL,
  AMENITY_TAG_INK,
  AMENITY_WATER_BORDER,
  AMENITY_WATER_FILL,
  AMENITY_WATER_INK,
  DARK_ACCENT_INK,
  DARK_CARD_INK,
  DARK_ERROR_INK,
  MEDALLION_NEGATIVE_BORDER,
  MEDALLION_NEGATIVE_FILL,
  MEDALLION_NEGATIVE_INK,
  MEDALLION_POSITIVE_FILL,
  MEDALLION_POSITIVE_INK,
  MEDALLION_WAITING_FILL,
  MEDALLION_WAITING_INK,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the three FIXED-FILL STATE SKINS (#858, class F-3 of the colour-literal audit) — the
 * outcome medallion, the amenity chip and the booking dialog's step badge.
 *
 * <p>All three are per-state skins whose fills are fixed literals on hosts that DO theme (none of
 * the eight sites pins porcelain — the only `data-riv-theme` host bindings in the tree are the
 * admin and operator consoles). So the #850 trap applies verbatim: a themed ink over a fill that
 * stays pale resolves light-on-light in the dark theme. Measured rather than assumed — see the
 * themed-alternative test, which keeps every bound in the tree so the reason survives the decision.
 *
 * <p><strong>How the families are cut.</strong> By FORM, never by value, and never across half a
 * per-state class ternary. `#0a5f74` paints a medallion ink, an amenity ink and a step-badge ink;
 * three roles on three surfaces, so three tokens — the fork #848 and #864 each settled. Conversely
 * `booking-pay.ts`'s single `[class]` ternary carries the medallion's amber waiting state beside
 * its teal confirmed state, so tokenising one branch and leaving its sibling a literal would be a
 * worse artifact than either whole option.
 *
 * <p>One file rather than three, because the three families share one guard mechanism and one
 * argument; the declaration blocks in `tailwind.css` stay separate, which is where the
 * declared-once property actually lives.
 *
 * <p>What jsdom maths CANNOT see is a dark override added later — every ratio here would still
 * pass. So the declaration tests read `src/tailwind.css` as text (the `core/theme-boot.spec.ts`
 * drift-guard pattern) via `testing/stylesheet-tokens`. The cross-theme proof against a real
 * render, where the cascade rather than a regex decides, is `e2e/fixed-fill-state-skins.e2e.ts`.
 */

/** Every token this slice registers, with the value `tailwind.css` is expected to declare for it. */
const MEDALLION = {
  '--riv-medallion-positive-fill': rgbToHex(MEDALLION_POSITIVE_FILL),
  '--riv-medallion-positive-ink': rgbToHex(MEDALLION_POSITIVE_INK),
  '--riv-medallion-waiting-fill': rgbToHex(MEDALLION_WAITING_FILL),
  '--riv-medallion-waiting-ink': rgbToHex(MEDALLION_WAITING_INK),
  '--riv-medallion-negative-fill': rgbToHex(MEDALLION_NEGATIVE_FILL),
  '--riv-medallion-negative-ink': rgbToHex(MEDALLION_NEGATIVE_INK),
  '--riv-medallion-negative-border': rgbToHex(MEDALLION_NEGATIVE_BORDER),
} as const;

const AMENITY = {
  '--riv-amenity-tag-ink': rgbToHex(AMENITY_TAG_INK),
  '--riv-amenity-tag-fill': rgbToHex(AMENITY_TAG_FILL),
  '--riv-amenity-tag-border': rgbToHex(AMENITY_TAG_BORDER),
  '--riv-amenity-water-ink': rgbToHex(AMENITY_WATER_INK),
  '--riv-amenity-water-fill': rgbToHex(AMENITY_WATER_FILL),
  '--riv-amenity-water-border': rgbToHex(AMENITY_WATER_BORDER),
} as const;

const REGISTRY: Record<string, string> = { ...MEDALLION, ...AMENITY };

/**
 * The three values this family now paints **exclusively**, so a tree-wide sweep is exactly right
 * for them: after this slice nothing else in `src/app` may carry one, and a future component that
 * does is a new painter to argue about rather than a false alarm.
 */
const EXCLUSIVE_LITERALS: readonly RegExp[] = [/#d9f2f7/i, /#f7e8e4/i, /#eecdc4/i];

/**
 * The other migrated values are NOT exclusive, so they get a **site-scoped** sweep instead — and
 * the asymmetry is the finding, not a shortcut. `#fcf0d9`/`#8a5410` also paints the amber NOTICE
 * BANNER (`withheld-email-notice` + the two legal pages): the medallion's exact pair on a different
 * form, with accessible text, which is its own class-F family and not this one. `#0a5f74` also
 * paints three `bg-` fills (#854/#861) and — inside `booking-dialog` itself — the
 * `--riv-cta-grad`-duplicating header gradient. A tree-wide sweep on either would demand a migration
 * this slice must not make, and a regex narrow enough to separate a medallion from a banner by
 * class-string adjacency alone would break the first time a formatter reordered a utility.
 *
 * <p>So each migrated site names what must be **gone** from it and what must be **kept** in it.
 */
const MIGRATED_SITES: readonly {
  readonly path: string;
  readonly gone: readonly string[];
  readonly kept?: readonly string[];
}[] = [
  { path: 'booking/booking-confirmation.ts', gone: ['#d9f2f7', '#0a5f74'] },
  {
    path: 'booking/booking-pay.ts',
    gone: ['#d9f2f7', '#0a5f74', '#fcf0d9', '#8a5410', '#f7e8e4', '#eecdc4', '#a3372a'],
  },
  { path: 'booking/request-confirmation.ts', gone: ['#fcf0d9', '#8a5410'] },
  { path: 'shared/failure-panel.ts', gone: ['#f7e8e4', '#eecdc4', '#a3372a'] },
  {
    path: 'shared/amenity-chip.ts',
    gone: ['#0a5f74', '#d7eef4', '#b9e0ea', '#2f4a54', '#eef2f4', '#dbe4e7'],
    // The marker classes the specs and two e2e query survive the restyle (riviera-tailwind rule 2).
    kept: ['amenity-chip', 'amenity-chip--water'],
  },
];

/**
 * The homes of these same values that this slice deliberately leaves alone, each with the ticket
 * that owns it. Asserted POSITIVELY — the `OUT_OF_FAMILY` mechanism #851 invented and #864
 * narrowed: a sweep that only proves absence cannot prove it did not over-reach.
 */
const OUT_OF_FAMILY: readonly { readonly path: string; readonly literal: string }[] = [
  { path: 'booking/withheld-email-notice.ts', literal: '#fcf0d9' },
  { path: 'pages/legal/privacy-policy.html', literal: '#fcf0d9' },
  { path: 'pages/legal/terms-of-service.html', literal: '#fcf0d9' },
  { path: 'shared/status-chip.ts', literal: '#8a5410' },
  { path: 'booking/booking-view.ts', literal: '#8a5410' },
  { path: 'operator/payouts-tab.html', literal: '#a3372a' },
  { path: 'operator/set-editor.html', literal: '#0a5f74' },
  { path: 'operator/layout-editor.html', literal: '#0a5f74' },
];

const APP_ROOT = join(process.cwd(), 'src/app');

/** Every component source — templates are inline `.ts` here, so both extensions are swept. */
function componentSources(): readonly string[] {
  return readdirSync(APP_ROOT, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

describe('Fixed-fill state skins — the outcome medallion (#858)', () => {
  it('each state clears AA on its own fill', () => {
    const pairs = [
      ['positive', MEDALLION_POSITIVE_INK, MEDALLION_POSITIVE_FILL],
      ['waiting', MEDALLION_WAITING_INK, MEDALLION_WAITING_FILL],
      ['negative', MEDALLION_NEGATIVE_INK, MEDALLION_NEGATIVE_FILL],
    ] as const;

    for (const [state, ink, fill] of pairs) {
      expect(contrastRatio(rgbToHex(ink), rgbToHex(fill)), state).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the themed alternative would not — which is why the family is invariant', () => {
    // The two tokens a value-led migration would reach for. Both theme; both land light on light.
    expect(
      contrastRatio(rgbToHex(DARK_ACCENT_INK), rgbToHex(MEDALLION_POSITIVE_FILL)),
      'dark --riv-accent-ink over the positive fill',
    ).toBeLessThan(AA_NORMAL);
    expect(
      contrastRatio(rgbToHex(DARK_ERROR_INK), rgbToHex(MEDALLION_NEGATIVE_FILL)),
      'dark --riv-error-ink over the negative fill',
    ).toBeLessThan(AA_NORMAL);
    expect(
      contrastRatio(rgbToHex(DARK_ERROR_INK), rgbToHex(MEDALLION_WAITING_FILL)),
      'dark --riv-error-ink over the waiting fill',
    ).toBeLessThan(AA_NORMAL);
  });

  it('states the aria-hidden exemption rather than inventing a contrast pair for it', () => {
    // All five medallion sites render a decorative glyph with `aria-hidden="true"`, so none owes an
    // AA assertion — the AA test above is a floor the values happen to clear, not a requirement
    // they are held to. The claim is asserted against the sources so it cannot rot silently.
    const sites = [
      'booking/booking-confirmation.ts',
      'booking/booking-pay.ts',
      'booking/request-confirmation.ts',
      'shared/failure-panel.ts',
    ];

    for (const path of sites) {
      expect(read(path), `${path} keeps its glyph decorative`).toMatch(/aria-hidden/);
    }

    // `appFailureIcon` renders no `aria-hidden` of its own — every CALL SITE supplies it.
    for (const host of ['venue/venue-map.html', 'pages/home/home.html']) {
      expect(read(host), `${host} hides the failure glyph`).toMatch(
        /appFailureIcon aria-hidden="true"/,
      );
    }
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(REGISTRY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares each token in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(REGISTRY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(REGISTRY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('leaves no component anywhere painting the three now-exclusive literals', () => {
    const offenders = componentSources().filter((path) =>
      EXCLUSIVE_LITERALS.some((literal) => literal.test(read(path))),
    );

    expect(offenders).toEqual([]);
  });

  it('leaves no migrated site painting its own literals, while keeping what it must', () => {
    for (const { path, gone, kept } of MIGRATED_SITES) {
      const source = read(path);

      for (const literal of gone) {
        expect(source, `${path} still paints ${literal}`).not.toContain(literal);
      }
      for (const literal of kept ?? []) {
        expect(source, `${path} lost ${literal}`).toContain(literal);
      }
    }
  });

  it('leaves the out-of-family homes of these values untouched', () => {
    // The half of the sweep that proves it did not over-reach. Each of these paints one of the
    // migrated VALUES in a role this slice does not own; if a later sweep takes one, this goes red
    // and the ledger row has to be argued rather than assumed.
    for (const { path, literal } of OUT_OF_FAMILY) {
      expect(read(path), `${path} still paints ${literal}`).toContain(literal);
    }
  });
});

describe('Fixed-fill state skins — the amenity chip (#858)', () => {
  it("both variants clear AA — the slice's ONLY sites that owe one", () => {
    // Every other position this slice migrates is an `aria-hidden` glyph. The chip is the exception:
    // it carries the amenity name and the "Xm to water" distance as real text, on a directive that
    // `shared/` mounts from hosts of differing themes. Its recipes live in `testing/chip-fills.ts`
    // so `shared/amenities.contrast.spec.ts` proves the same pairs against the rendered chip.
    for (const { name, ink, fill } of DESCRIPTIVE_CHIPS) {
      expect(contrastRatio(ink, fill), name).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the themed alternative would not — which is why the family is invariant', () => {
    expect(
      contrastRatio(rgbToHex(DARK_ACCENT_INK), rgbToHex(AMENITY_WATER_FILL)),
      'dark --riv-accent-ink over the water fill',
    ).toBeLessThan(AA_NORMAL);
    expect(
      contrastRatio(rgbToHex(DARK_CARD_INK), rgbToHex(AMENITY_TAG_FILL)),
      'dark --riv-card-ink over the tag fill',
    ).toBeLessThan(AA_NORMAL);
  });

  it('keeps the two variants as ONE family, cut by form', () => {
    // The chip's water ink is what #858 enumerated; its neutral sibling is the same three roles in
    // the same `computed()` ternary. Migrating one and leaving the other a literal is the mis-cut
    // this ticket exists to undo, so the family is both variants or neither.
    expect(Object.keys(AMENITY)).toHaveLength(6);
    expect(DESCRIPTIVE_CHIPS.map((chip) => [chip.fillClass, chip.inkClass])).toEqual([
      ['bg-riv-amenity-tag-fill', 'text-riv-amenity-tag-ink'],
      ['bg-riv-amenity-water-fill', 'text-riv-amenity-water-ink'],
    ]);
  });
});
