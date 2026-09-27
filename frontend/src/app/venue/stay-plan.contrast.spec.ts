import { AA_LARGE, AA_NORMAL, contrastRatio } from '../../testing/contrast';
import { baseBlock, themeBlock } from '../../testing/stylesheet-tokens';

/**
 * The stitched plan's stretch fills: the one ink reads at AA over every fill in every theme (the
 * strip's day numbers and the stop discs are text), and each fill marks its stretch at 3:1 against
 * its neighbours' ink-side, so the strip's boundaries survive as non-text contrast (docs/design/
 * non-text-contrast.md rule 2). Pure maths over `src/tailwind.css` as text, per theme block.
 */
const FILLS = [
  '--riv-stretch-1-fill',
  '--riv-stretch-2-fill',
  '--riv-stretch-3-fill',
  '--riv-stretch-4-fill',
];

function declared(block: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block);
  if (match === null) {
    throw new Error(`${name} is not declared as an opaque hex in this block`);
  }
  return match[1];
}

const THEMES = [
  { name: 'porcelain', block: baseBlock() },
  { name: 'riviera', block: themeBlock('riviera') },
  { name: 'dark', block: themeBlock('dark') },
];

describe.each(THEMES)('Stretch fills — $name theme', ({ block }) => {
  const ink = declared(block, '--riv-stretch-ink');
  const fills = FILLS.map((name) => declared(block, name));

  it('the stretch ink meets AA over every fill', () => {
    for (const fill of fills) {
      expect(contrastRatio(ink, fill), `${ink} over ${fill}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the fills are opaque and each stands apart from the ink at 3:1 as a boundary', () => {
    expect(new Set(fills).size).toBe(fills.length);
    for (const fill of fills) {
      expect(contrastRatio(fill, ink)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});
