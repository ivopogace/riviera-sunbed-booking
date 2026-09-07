import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The console paints no colour literal. The dark console theme is tokens doing the switching, so a
 * literal in a console source is a position the dark theme cannot reach — the grey slabs the
 * console-nav spike's dark contact sheets showed were exactly that: `bg-white/60` fields and
 * buttons, `text-[#0c2a33]` numerals, an amber banner in raw hex. This sweep reads the console
 * sources as text and fails naming the file and the utility, so a literal cannot come back
 * unnoticed.
 *
 * <p>Two populations, because the colour-literal ledger's own command (`-[#…]` / `-[rgba(…`) never
 * counted the second: Tailwind's NAMED `white` and `black` in a fill, border, ring or gradient
 * position. Both are literals in the only sense that matters here — neither resolves through a
 * `--riv-*` token, so neither themes.
 *
 * <p>The recorded residue is what a fixed surface is allowed to keep: `text-white` and
 * `outline-white` over a solid fill or the CTA gradient (the fixed-ink family — a fixed fill pins
 * its ink), and the camera preview's `bg-black/80` letterbox (a video is a photo surface, and a
 * photo is not themed). `shared/status-chip.ts`'s nine-state palette is the ledger's class S and
 * is outside this sweep's sources on purpose. Shadows are outside both populations: a shadow's
 * rgba cannot drift light-on-light, and the ledger records them as their own class.
 */

const APP = join(process.cwd(), 'src/app');

/** Every source the console renders: its two feature folders, the shell, and the shared
 *  primitives only the console (or the console's beach map) draws. */
const CONSOLE_SOURCES: readonly string[] = [
  ...sourcesUnder('operator'),
  ...sourcesUnder('admin'),
  'console-shell.ts',
  'shared/beach-grid-frame.ts',
  'shared/stat-tile.ts',
  'shared/confirm-with-reason.ts',
  'shared/console-palette.ts',
];

const COLOUR_UTILITIES = '(?:text|bg|border|fill|stroke|ring|outline|from|to|via|divide)';

/** The ledger's population: a hex or `rgb()` literal in a colour utility's arbitrary value. */
const HEX_OR_RGB = new RegExp(
  String.raw`[\w:&\[\]\.>-]*${COLOUR_UTILITIES}-\[(?:#[0-9a-f]{3,8}|rgba?\()[^\]]*\]`,
  'gi',
);

/** The second population: Tailwind's named white / black, with or without a modifier. */
const NAMED = new RegExp(
  String.raw`[\w:&\[\]\.>-]*\b${COLOUR_UTILITIES}-(?:white|black)(?:/[0-9]+)?\b`,
  'g',
);

/** The residue a fixed surface keeps, matched as whole utilities. */
const RESIDUE = /^(?:[\w:&-]*:)?(?:text-white|outline-white)$|^bg-black\/80$/;

function sourcesUnder(folder: string): readonly string[] {
  return readdirSync(join(APP, folder), { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'))
    .map((path) => join(folder, path));
}

/** `path: utility` per hit, so the failure names what to change. */
function literalsIn(path: string): readonly string[] {
  const source = readFileSync(join(APP, path), 'utf8');
  const hits = [...source.matchAll(HEX_OR_RGB), ...source.matchAll(NAMED)]
    .map((match) => match[0])
    .filter((utility) => !RESIDUE.test(utility));
  return [...new Set(hits)].map((utility) => `${path}: ${utility}`);
}

describe('The console paints no colour literal (#1010)', () => {
  it('sweeps the console sources, not an empty list', () => {
    expect(CONSOLE_SOURCES.length).toBeGreaterThan(40);
    expect(CONSOLE_SOURCES).toContain('operator/daily-view-tab.html');
    expect(CONSOLE_SOURCES).toContain('admin/admin-privacy.ts');
  });

  it('recognises both literal forms, and the residue — the sweep must be able to fail', () => {
    const sample =
      'class="bg-white/60 hover:bg-white text-[#0c2a33] ring-[#0a5f74] border-[rgba(240,170,46,0.55)] text-white bg-black/80 outline-white bg-riv-console-inset/60"';
    const hits = [...sample.matchAll(HEX_OR_RGB), ...sample.matchAll(NAMED)]
      .map((match) => match[0])
      .filter((utility) => !RESIDUE.test(utility));

    expect(hits).toEqual([
      'text-[#0c2a33]',
      'ring-[#0a5f74]',
      'border-[rgba(240,170,46,0.55)]',
      'bg-white/60',
      'hover:bg-white',
    ]);
  });

  it('paints no colour literal outside the recorded residue', () => {
    expect(CONSOLE_SOURCES.flatMap(literalsIn)).toEqual([]);
  });
});
