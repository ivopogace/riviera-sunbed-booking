import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No pictorial mark is a character. A symbol-block or emoji codepoint arrives at a weight, size
 * and colour the UI font never chose, and differs per platform; the app draws each such mark as
 * an inline-SVG `shared/*-icon.ts` component instead (`riviera-tailwind` ICON-1..6). This
 * sweep reads every non-spec source as text, comments stripped, and fails naming the file, the
 * line and the codepoint, so a glyph cannot come back unnoticed.
 *
 * <p>A character doing typographic work in running text stays a character, and is not in
 * {@link RETIRED}: `·`, `€`, `⌘K`, `→`, the map zoom pair `+`/`−`. The {@link RESIDUE} is where a
 * retired codepoint is text, not a mark.
 */

const APP = join(process.cwd(), 'src/app');

/** Each retired codepoint, with the component that now draws its job. */
const RETIRED: Readonly<Record<string, string>> = {
  '✕': 'app-cross-icon',
  '×': 'app-cross-icon',
  '★': 'app-star-icon',
  '☆': 'app-star-icon',
  '✓': 'app-check-icon',
  '⏳': 'app-hourglass-icon',
  '✉': 'app-mail-icon',
  '●': 'app-dot-icon',
  '⚠': 'app-alert-icon',
  '⏰': 'app-clock-icon',
  '⛱': 'app-umbrella-icon',
  '🏖': 'app-umbrella-icon',
  '▾': 'app-chevron-down-icon',
  '▲': 'app-triangle-icon',
  '▼': 'app-triangle-icon',
  '←': 'app-arrow-left-icon',
  '🌧': 'app-rain-icon',
  '🎉': 'app-party-icon',
  '🔒': 'app-lock-icon',
};

/** A retired codepoint that is text, matched on its trimmed source line. */
const RESIDUE: readonly { file: string; line: RegExp }[] = [
  // The grid-size sign in a sentence ("Generated a 2×3 grid") — the multiplication sign, not a cross.
  { file: 'operator/layout-editor.ts', line: /Generated a \$\{rows\}×\$\{cols\} grid/ },
  // A price pin's label when the venue has no price: text the pin-crowding maths measures as text.
  { file: 'pages/home/venue-pin-layer.html', line: /priceLabel \?\? '●'/ },
];

function sources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'))
    .map((path) => path.split('\\').join('/'));
}

/** Blank every comment but keep its newlines, so a hit still reports its real line number. */
function withoutComments(text: string): string {
  const blank = (comment: string) => comment.replaceAll(/[^\n]/g, ' ');
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, blank)
    .replaceAll(/<!--[\s\S]*?-->/g, blank)
    .replaceAll(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + blank(match.slice(lead.length)),
    );
}

describe('pictorial glyph sweep', () => {
  it('finds no retired pictorial codepoint in any source', () => {
    const hits: string[] = [];
    for (const file of sources()) {
      const lines = withoutComments(readFileSync(join(APP, file), 'utf8')).split('\n');
      lines.forEach((line, index) => {
        for (const [glyph, icon] of Object.entries(RETIRED)) {
          if (!line.includes(glyph)) continue;
          if (RESIDUE.some((r) => r.file === file && r.line.test(line.trim()))) continue;
          hits.push(`${file}:${index + 1} ${glyph} → ${icon}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it('keeps every residue entry live, so a stale exemption cannot hide a new glyph', () => {
    for (const { file, line } of RESIDUE) {
      const text = readFileSync(join(APP, file), 'utf8');
      expect(
        text.split('\n').some((l) => line.test(l.trim())),
        file,
      ).toBe(true);
    }
  });
});
