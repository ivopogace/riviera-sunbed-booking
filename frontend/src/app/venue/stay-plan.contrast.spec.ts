import { AA_LARGE, AA_NORMAL, contrastRatio } from '../../testing/contrast';
import { baseBlock, themeBlock } from '../../testing/stylesheet-tokens';

/**
 * The stitched plan's stretch fills: the one ink reads at AA over every fill in every theme (the
 * strip's day numbers and the stop discs are text), and the move marker the strip draws in that ink
 * clears 3:1 over every fill, so a move day survives as non-text contrast (WCAG 1.4.11) when the
 * hues alone would not. Pure maths over `src/tailwind.css` and `stay-plan.ts` as text, per theme.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('the move marker is drawn in the stretch ink and clears 3:1 over every fill', () => {
    const template = readFileSync(join(process.cwd(), 'src/app/venue/stay-plan.ts'), 'utf8');
    expect(template).toContain('[class.border-riv-stretch-ink]="cell.move"');
    expect(template).not.toContain('[class.border-riv-card-ink]="cell.move"');
    expect(new Set(fills).size).toBe(fills.length);
    for (const fill of fills) {
      expect(contrastRatio(ink, fill), `marker ${ink} over ${fill}`).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    }
  });
});
