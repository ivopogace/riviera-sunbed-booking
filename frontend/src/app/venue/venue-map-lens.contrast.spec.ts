import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import { baseBlock, themeBlock } from '../../testing/stylesheet-tokens';
import { MAP_OVERVIEW_LOOKS, MAP_TILE_STATES } from './map-tile';

/**
 * WCAG 1.4.11 guard for the phone row lens (#1762): every overview state, the pick, the plan ring,
 * the chevron and the position bar clear 3:1 against what they sit on, in each of the three themes.
 * Closed rows sit on the sea→sand wash, so each is measured over all three wash stops; the open
 * row's own surface is the chip fill composited over those stops.
 *
 * Token values are read from `src/tailwind.css` as text, per theme, so a retune moves these numbers
 * with it; the looks' class strings are pinned to the tokens measured, so the two cannot part. The
 * maths has no size in it: that a 1.5px stroke still paints these colours on a 12px cell is the
 * rendered check in `e2e/venue-map-row-lens.e2e.ts`.
 */
interface Paint {
  readonly color: Rgb;
  readonly alpha: number;
}

const NON_TEXT = AA_LARGE;

function parse(value: string, name: string): Paint {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    return { color: hexToRgb(hex[1]), alpha: 1 };
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (rgba) {
    return {
      color: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: Number(rgba[4]),
    };
  }
  throw new Error(`${name} is neither #rrggbb nor rgba(): "${value}"`);
}

function declaredIn(block: string, name: string): string | null {
  const match = new RegExp(String.raw`^\s*${name}:\s*([^;]+);`, 'm').exec(block);
  return match ? match[1].trim() : null;
}

interface Theme {
  readonly name: string;
  readonly token: (name: string) => Paint;
}

/** A theme resolves a token from its own block, else from the base block it inherits. */
function theme(name: string, own: string | null): Theme {
  return {
    name,
    token: (token) => {
      const value = (own && declaredIn(own, token)) ?? declaredIn(baseBlock(), token);
      if (value === null) {
        throw new Error(`${token} is declared in neither ${name}'s block nor the base block`);
      }
      return parse(value, token);
    },
  };
}

const THEMES: readonly Theme[] = [
  theme('porcelain', null),
  theme('riviera', themeBlock('riviera')),
  theme('dark', themeBlock('dark')),
];

const over = (paint: Paint, ground: Rgb): Rgb => composite(paint.color, paint.alpha, ground);
const ratio = (a: Rgb, b: Rgb): number => contrastRatio(rgbToHex(a), rgbToHex(b));

describe.each(THEMES)('Row lens non-text contrast, $name theme', ({ name, token }) => {
  const wash = ['--riv-map-sea', '--riv-map-mid', '--riv-map-sand'].map((t) => token(t).color);
  /** The open row's card: the chip fill over each wash stop. */
  const openSurface = wash.map((stop) => over(token('--riv-map-chip-fill'), stop));

  function expectOver(grounds: readonly Rgb[], what: string, paint: Paint, floor = NON_TEXT): void {
    for (const ground of grounds) {
      const painted = over(paint, ground);
      expect(
        ratio(painted, ground),
        `${what} ${rgbToHex(painted)} over ${rgbToHex(ground)} in ${name}`,
      ).toBeGreaterThanOrEqual(floor);
    }
  }

  describe('closed rows, over every wash stop', () => {
    it.each([
      ['the free edge, standard hue', '--riv-tile-available-ink'],
      ['the free edge, front-row hue', '--riv-tile-premium-ink'],
      ['the partly-free half tint, standard hue', '--riv-tile-partly-tint'],
      ['the partly-free half tint, front-row hue', '--riv-tile-partly-premium-tint'],
      ['the walk-in dot and ring', '--riv-tile-walkin-ink'],
      ['the taken strike and ring', '--riv-tile-taken-border'],
      ['the pick', '--riv-tile-pick-fill'],
      ['the plan ring, stretch 1', '--riv-stretch-1-ring'],
      ['the plan ring, stretch 2', '--riv-stretch-2-ring'],
      ['the plan ring, stretch 3', '--riv-stretch-3-ring'],
      ['the plan ring, stretch 4', '--riv-stretch-4-ring'],
      ['the chevron', '--riv-accent-ink'],
      ['the position bar’s thumb', '--riv-accent-ink'],
    ])('%s clears 3:1', (what, name_) => {
      expectOver(wash, what, token(name_));
    });

    it('the position bar’s thumb clears 3:1 against its own track too', () => {
      for (const stop of wash) {
        const track = over(token('--riv-map-chip-border'), stop);
        expect(ratio(token('--riv-accent-ink').color, track)).toBeGreaterThanOrEqual(NON_TEXT);
      }
    });

    it('the free tint is under 3:1 on purpose: the edge carries the state, solid is the pick’s alone', () => {
      for (const stop of wash) {
        const tint = composite(token('--riv-tile-available-ink').color, 0.18, stop);
        expect(ratio(tint, stop)).toBeLessThan(NON_TEXT);
      }
    });

    it('the row note and the hints read at AA', () => {
      expectOver(wash, 'the soft card ink', token('--riv-card-ink-soft'), AA_NORMAL);
    });
  });

  describe('the open row, over its own surface', () => {
    it('the close chevron clears 3:1', () => {
      expectOver(openSurface, 'the close chevron', token('--riv-accent-ink'));
    });

    it('the picked tile’s fill clears 3:1', () => {
      expectOver(openSurface, 'the picked tile', token('--riv-tile-pick-fill'));
    });

    it('the picked tile’s number reads at AA on its fill, and its tick clears 3:1 on the badge', () => {
      const fill = token('--riv-tile-pick-fill').color;
      const ink = token('--riv-tile-pick-ink').color;
      // One pair both ways: the number is the ink on the fill, the tick the fill on an ink disc.
      expect(ratio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(ratio(fill, ink)).toBeGreaterThanOrEqual(NON_TEXT);
    });

    it('the head’s summary and the band’s count read at AA', () => {
      expectOver(openSurface, 'the soft card ink', token('--riv-card-ink-soft'), AA_NORMAL);
    });
  });
});

describe('Row lens looks are drawn in the tokens measured above', () => {
  const lens = readFileSync(join(process.cwd(), 'src/app/shared/beach-row-lens.html'), 'utf8');
  const row = readFileSync(join(process.cwd(), 'src/app/venue/venue-map-row.ts'), 'utf8');

  it.each([
    ['available', ['text-riv-tile-available-ink', 'bg-current/18']],
    ['premium', ['text-riv-tile-premium-ink', 'bg-current/16']],
    ['partly', ['text-riv-tile-available-ink', 'after:border-riv-tile-partly-tint']],
    ['partly-premium', ['text-riv-tile-premium-ink', 'after:border-riv-tile-partly-premium-tint']],
    ['walkin', ['text-riv-tile-walkin-ink', 'after:border-current']],
    ['taken', ['text-riv-tile-taken-border', 'after:border-current']],
    ['pick', ['text-riv-tile-pick-fill', 'after:border-current']],
  ] as const)('%s', (key, utilities) => {
    for (const utility of utilities) {
      expect(MAP_OVERVIEW_LOOKS[key].split(' ')).toContain(utility);
    }
  });

  it('every tile state has an overview look', () => {
    for (const state of MAP_TILE_STATES) {
      expect(MAP_OVERVIEW_LOOKS[state]).toBeTruthy();
    }
  });

  it('only the pick is solid: no other look fills its cell', () => {
    const solid = Object.entries(MAP_OVERVIEW_LOOKS)
      .filter(([, look]) => look.includes('after:inset-0'))
      .map(([key]) => key);
    expect(solid).toEqual(['pick']);
    for (const [key, look] of Object.entries(MAP_OVERVIEW_LOOKS)) {
      // A background is a tint at most: every look's only `bg-` utility carries an alpha.
      for (const utility of look.split(' ').filter((u) => u.startsWith('bg-'))) {
        expect(utility, `${key} paints ${utility}`).toMatch(/^bg-current\/1\d$/);
      }
    }
  });

  it('every shape is a border, which forced colours keep, never a gradient or a shadow', () => {
    for (const look of Object.values(MAP_OVERVIEW_LOOKS)) {
      expect(look).not.toMatch(/gradient|shadow/);
    }
  });

  it('the lens draws its chevrons and the position thumb in the accent ink', () => {
    expect(lens).toContain('class="text-riv-accent-ink [&_svg]:size-4 [&_svg]:-rotate-90"');
    expect(lens).toContain('place-items-center rounded-xl text-riv-accent-ink');
    expect(lens).toContain('border-t-4 border-riv-accent-ink');
    expect(lens).toContain('bg-riv-map-chip-border');
    expect(lens).toContain('bg-riv-map-chip-fill');
  });

  it('the picked tile wears the pick tokens, tick included', () => {
    expect(row).toContain('border-riv-tile-pick-fill bg-riv-tile-pick-ink text-riv-tile-pick-fill');
  });
});
