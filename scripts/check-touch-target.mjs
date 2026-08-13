/**
 * Diff-scoped guard for the 44 × 44 px touch-target floor's **declaration** (#648), the static half
 * of the mechanism `docs/plans/touch-target-floor.md` (#605) put in place.
 *
 * - **TT-1** — a judged control declares neither `appTouchTarget` nor a `data-touch-exempt` on
 *   itself or an ancestor. It cannot know whether the rendered box is 44 px; it knows whether
 *   anyone decided.
 *
 * `<a>` is deliberately **out of scope**: `min-height` is a no-op on a `display: inline` box, so a
 * directive on a link is a declaration that can be false, and marking the app's 59 undeclared links
 * would manufacture exactly that. Links stay `frontend/e2e/touch-targets*.e2e.ts`'s and RV-FE's job.
 * The same posture `check-focus-posture.mjs` takes with the `<input>` kinds `readonly` cannot lock:
 * cover what the predicate judges exactly, and say plainly what is out of reach.
 *
 * The complement, never the replacement: only the e2e sweep measures a rendered box, and it caught
 * every #605 finding that mattered. This proves the mechanism reaches surfaces no sweep visits.
 */

/** Angular templates only; a spec's fixtures are allowed to build the non-compliant forms. */
const IN_SCOPE = /^frontend\/src\/app\/.*(?<!\.spec)\.(ts|html)$/;

/** The controls whose floor a static rule can judge — see the header on why `<a>` is absent. */
const JUDGED = new Set(['button', 'input', 'select', 'textarea']);

/**
 * Elements that never have an end tag, per the HTML spec, and so can never open an exemption scope.
 * `<input>` is both judged and void — it is exempted by an ancestor, never by its own subtree.
 */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Finds every undeclared control the diff wrote in one file.
 *
 * <p>An exemption is inherited, because that is how the shipped markup expresses it: `auth-page.ts`
 * puts the reason on the `<p>` that *is* the sentence and leaves the `<button>` inside it bare. So
 * the walk carries a stack rather than judging each tag alone.
 *
 * @param {{ path: string, lines: string[], added: Set<number> }} input the file's new content and
 *   the 1-based line numbers the diff added
 * @returns {{ path: string, line: number, rule: string, text: string }[]} one entry per violation
 */
export function findViolations({ path, lines, added }) {
  const violations = [];
  const open = [];

  for (const tag of walkTags(templateRegion(path, lines))) {
    if (tag.kind === 'close') {
      const at = open.findLastIndex((element) => element.name === tag.name);
      if (at !== -1) open.length = at;
      continue;
    }
    const marker = tag.attributes.get('data-touch-exempt');
    const exempt = marker !== undefined;
    if (exempt && marker.value.trim() === '' && added.has(tag.line)) {
      violations.push({ path, line: tag.line, rule: 'TT-2', text: lines[tag.line - 1].trim() });
    } else if (
      JUDGED.has(tag.name) &&
      added.has(tag.line) &&
      !exempt &&
      !tag.attributes.has('appTouchTarget') &&
      !open.some((element) => element.exempt)
    ) {
      violations.push({ path, line: tag.line, rule: 'TT-1', text: lines[tag.line - 1].trim() });
    }
    if (!tag.selfClosed && !VOID.has(tag.name)) open.push({ name: tag.name, exempt });
  }
  return violations;
}

/**
 * Blanks everything that is not template markup, keeping line and column geometry so a violation
 * still reports its real position.
 *
 * An `.html` file is all template but for its comments; a `.ts` file is template only inside its
 * `template:` literals. Without the second, `touch-target.ts`'s own TSDoc — which spells out
 * `<button appTouchTarget>` to document the convention — would read as markup.
 */
function templateRegion(path, lines) {
  return path.endsWith('.html') ? maskHtmlComments(lines) : maskTypescript(lines);
}

function maskHtmlComments(lines) {
  const out = lines.map((line) => line.split(''));
  let open = false;

  for (let i = 0; i < out.length; i++) {
    for (let c = 0; c < out[i].length; c++) {
      if (open) {
        if (startsWith(out[i], '-->', c)) {
          blank(out[i], c, 3);
          c += 2;
          open = false;
        } else {
          out[i][c] = ' ';
        }
      } else if (startsWith(out[i], '<!--', c)) {
        blank(out[i], c, 4);
        c += 3;
        open = true;
      }
    }
  }
  return out.map((chars) => chars.join(''));
}

const TEMPLATE_KEY = /template\s*:\s*$/;

/** Keeps the contents of `template:` literals and blanks every other character. */
function maskTypescript(lines) {
  const template = lines.map((line) => ' '.repeat(line.length).split(''));
  const source = lines.map((line) => line.split(''));
  let state = 'code';
  let depth = 0;
  let pending = '';

  for (let i = 0; i < source.length; i++) {
    for (let c = 0; c < source[i].length; c++) {
      const ch = source[i][c];

      if (state === 'block') {
        if (startsWith(source[i], '*/', c)) {
          state = 'code';
          c++;
        }
        continue;
      }
      // Above the backtick handler below, or the closing backtick re-opens the string instead.
      if (state === 'string') {
        if (ch === '\\') c++;
        else if (ch === '`') state = 'code';
        continue;
      }
      if (state === 'template') {
        if (ch === '\\') {
          c++;
        } else if (depth > 0) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        } else if (startsWith(source[i], '${', c)) {
          depth = 1;
          c++;
        } else if (ch === '`') {
          state = 'code';
          pending = '';
        } else {
          template[i][c] = ch;
        }
        continue;
      }
      if (startsWith(source[i], '//', c)) break;
      if (startsWith(source[i], '/*', c)) {
        const end = indexOfFrom(source[i], '*/', c + 2);
        if (end === -1) {
          state = 'block';
          break;
        }
        c = end + 1;
        pending = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        c = skipString(source[i], c) - 1;
        pending = '';
        continue;
      }
      if (ch === '`') {
        if (TEMPLATE_KEY.test(pending)) {
          state = 'template';
          depth = 0;
        } else {
          state = 'string';
        }
        pending = '';
        continue;
      }
      pending = /[\s\w:]/.test(ch) ? `${pending}${ch}`.slice(-40) : '';
    }
    if (state === 'code') pending = `${pending}\n`.slice(-40);
  }
  return template.map((chars) => chars.join(''));
}

/** Scans from the opening quote at `c` to just past its match, honouring backslash escapes. */
function skipString(chars, c) {
  const quote = chars[c];
  for (let i = c + 1; i < chars.length; i++) {
    if (chars[i] === '\\') i++;
    else if (chars[i] === quote) return i + 1;
  }
  return chars.length;
}

function startsWith(chars, token, at) {
  for (let i = 0; i < token.length; i++) {
    if (chars[at + i] !== token[i]) return false;
  }
  return true;
}

function indexOfFrom(chars, token, from) {
  for (let i = from; i <= chars.length - token.length; i++) {
    if (startsWith(chars, token, i)) return i;
  }
  return -1;
}

function blank(chars, at, length) {
  for (let i = at; i < at + length; i++) chars[i] = ' ';
}

/**
 * Walks the template and returns one entry per element tag — start and end alike, in document
 * order — with a start tag's attributes and the line it opens on.
 *
 * A start tag legitimately spans lines — every multi-line binding in the app is written that way —
 * so this tracks position across the whole region rather than per line.
 */
function walkTags(lines) {
  const tags = [];

  for (let i = 0; i < lines.length; i++) {
    for (let c = 0; c < lines[i].length; c++) {
      if (lines[i][c] !== '<') continue;
      const closing = lines[i][c + 1] === '/';
      const from = closing ? c + 2 : c + 1;
      if (!/[A-Za-z]/.test(lines[i][from] ?? '')) continue;
      const name = /^[\w-]+/.exec(lines[i].slice(from))[0].toLowerCase();
      if (closing) {
        tags.push({ kind: 'close', name });
        c = from + name.length - 1;
        continue;
      }
      const tag = readAttributes(lines, i, from + name.length);
      tags.push({
        kind: 'open',
        name,
        attributes: tag.attributes,
        selfClosed: tag.selfClosed,
        line: i + 1,
      });
      i = tag.line;
      c = tag.column;
    }
  }
  return tags;
}

function readAttributes(lines, line, column) {
  const attributes = new Map();
  let i = line;
  let c = column;
  let slash = false;

  while (i < lines.length) {
    if (c >= lines[i].length) {
      i++;
      c = 0;
      continue;
    }
    const ch = lines[i][c];
    if (ch === '>') return { attributes, line: i, column: c, selfClosed: slash };
    if (/[\s/]/.test(ch)) {
      slash ||= ch === '/';
      c++;
      continue;
    }
    // `{{ a<b ? 'x' : 'y' }}` reads as a start tag, and its quote is where a name should be.
    const name = /^[^\s=>/'"]+/.exec(lines[i].slice(c));
    if (name === null) return { attributes, line: i, column: c, selfClosed: slash };
    slash = false;
    c += name[0].length;
    if (lines[i][c] !== '=') {
      attributes.set(name[0], { value: '', line: i });
      continue;
    }
    const read = readValue(lines, i, c + 1);
    attributes.set(name[0], { value: read.value, line: i });
    i = read.line;
    c = read.column;
  }
  return { attributes, line: lines.length - 1, column: 0, selfClosed: slash };
}

function readValue(lines, line, column) {
  const quote = lines[line][column];
  if (quote !== '"' && quote !== "'") {
    const bare = /^[^\s>]*/.exec(lines[line].slice(column))[0];
    return { value: bare, line, column: column + bare.length };
  }
  let value = '';
  for (let i = line; i < lines.length; i++) {
    const from = i === line ? column + 1 : 0;
    const end = lines[i].indexOf(quote, from);
    if (end === -1) {
      value += `${lines[i].slice(from)}\n`;
      continue;
    }
    return { value: value + lines[i].slice(from, end), line: i, column: end + 1 };
  }
  return { value, line: lines.length - 1, column: 0 };
}

export { IN_SCOPE };
