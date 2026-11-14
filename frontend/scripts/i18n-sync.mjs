/**
 * Brings every translation file `angular.json` lists (`src/locale/messages.<locale>.xlf`) in line
 * with the messages the source marks (ADR-0030): extracts them afresh, keeps each translation whose
 * message still exists, adds new messages without a `<target>` and drops the ones nothing marks.
 * A message left without a target fails `npm run build` (`i18nMissingTranslation: error`), so the
 * file is complete exactly when the build passes.
 *
 *   npm run i18n:sync                                   # from frontend/
 *   npm run i18n:sync -- --fill sq=path/to/sq.json      # also set targets from a {id: target} map
 *
 * Location contexts keep the source file but not the line, so an edit elsewhere in a template never
 * churns the translation files.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNIT = /<trans-unit id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;

/** Every unit of an XLIFF 1.2 file, in document order. */
function unitsOf(xml) {
  return [...xml.matchAll(UNIT)].map(([, id, body]) => ({ id, body }));
}

function targetOf(body) {
  return /<target[^>]*>([\s\S]*?)<\/target>/.exec(body)?.[1];
}

function parseFills(argv) {
  const fills = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--fill') continue;
    const [locale, file] = argv[++i].split('=');
    fills.set(locale, JSON.parse(readFileSync(path.resolve(file), 'utf8')));
  }
  return fills;
}

/** The source unit's body without line numbers, with `target` (if any) right after `<source>`. */
function renderUnit({ id, body }, target) {
  const kept = body
    .replace(/\s*<context context-type="linenumber">[^<]*<\/context>/g, '')
    .replace(/\s*<target[^>]*>[\s\S]*?<\/target>/, '');
  const withTarget =
    target === undefined
      ? kept
      : kept.replace(
          /(<source>[\s\S]*?<\/source>)/,
          `$1\n        <target state="translated">${target}</target>`,
        );
  return `      <trans-unit id="${id}" datatype="html">${withTarget}</trans-unit>`;
}

const angular = JSON.parse(readFileSync(path.join(FRONTEND, 'angular.json'), 'utf8'));
const { locales } = angular.projects.frontend.i18n;
const fills = parseFills(process.argv.slice(2));

const out = mkdtempSync(path.join(tmpdir(), 'riviera-i18n-'));
try {
  execSync(`npx ng extract-i18n --output-path "${out}"`, { cwd: FRONTEND, stdio: 'inherit' });
  const source = unitsOf(readFileSync(path.join(out, 'messages.xlf'), 'utf8'));

  for (const [locale, { translation }] of Object.entries(locales)) {
    const file = path.join(FRONTEND, translation);
    const known = new Map(
      existsSync(file)
        ? unitsOf(readFileSync(file, 'utf8')).map((u) => [u.id, targetOf(u.body)])
        : [],
    );
    const fill = fills.get(locale) ?? {};
    let missing = 0;
    const body = source.map((unit) => {
      const target = fill[unit.id] ?? known.get(unit.id);
      if (target === undefined) missing++;
      return renderUnit(unit, target);
    });
    writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="${angular.projects.frontend.i18n.sourceLocale.code}" target-language="${locale}" datatype="plaintext" original="ng2.template">
    <body>
${body.join('\n')}
    </body>
  </file>
</xliff>
`,
    );
    console.log(`${translation}: ${source.length} messages, ${missing} without a translation`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
