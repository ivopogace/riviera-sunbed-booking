/**
 * Diff-scoped guard for the plan doc's **File structure** section (issue #533, sibling of #529's
 * RV-STYLE-1 guard): every path a slice changes should be listed there, because that section is
 * what a resuming session reads to know what the slice touches.
 *
 * Reports one direction only — **in the diff, absent from the section**. The reverse (a path the
 * plan listed and the work turned out not to need) is legitimate drift and is never reported; a
 * plan is written before the work.
 *
 * A slice with no plan doc passes cleanly: `riviera-sdlc` rule 6 lets a one-line fix skip the plan
 * doc entirely, and a guard must not invent a requirement the SDLC does not make.
 */

/** The heading that opens the section, as the plan-doc template writes it. */
const HEADING = /^##\s+File structure\s*$/i;

/**
 * Returns the lines under `## File structure` up to the next `## ` heading, or null when the doc
 * has no such section. `---` rules and `### ` sub-headings stay inside — only a sibling heading
 * closes it.
 */
export function sectionOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** A backticked span that could be a path: no spaces, and a file extension. `*` allowed. */
const PATH_LIKE = /^[\w@][\w./@*-]*\.[A-Za-z0-9]+$/;

/** A backticked span naming a directory, e.g. `frontend/src/app/venue-admin/`. */
const DIR_LIKE = /^[\w@][\w./@*-]*\/$/;

/** A bare extension, e.g. `.html` or `.a11y.spec.ts` — a sibling of the path written before it. */
const SIBLING_EXT = /^\.[A-Za-z0-9][\w.]*$/;

/** `privacy-policy.ts` + `.a11y.spec.ts` → `privacy-policy.a11y.spec.ts`. */
function siblingOf(base, extension) {
  return base.replace(/\.[^./]*$/, '') + extension;
}

/** `frontend/e2e/{a,b}.e2e.ts` → one entry per alternative; recursive, so nesting works. */
function expandBraces(token) {
  const braces = /^(.*?)\{([^{}]*)\}(.*)$/.exec(token);
  if (!braces) return [token];
  const [, before, alternatives, after] = braces;
  return alternatives.split(',').flatMap((one) => expandBraces(`${before}${one.trim()}${after}`));
}

/**
 * `venue-create-card.ts|.html` → both files. An alternative that starts with `.` is a sibling
 * extension of the first one; anything else is a path in its own right.
 */
function expandPipes(token) {
  if (!token.includes('|')) return [token];
  const [first, ...rest] = token.split('|');
  return [first, ...rest.map((one) => (one.startsWith('.') ? siblingOf(first, one) : one))];
}

/**
 * Every path a File-structure section names, in source order.
 *
 * Parsed line by line because one real idiom is positional: a bare extension attaches to the path
 * written before it *on the same line* (`` `privacy-policy.ts`/`.html` ``). Bullets that carry only
 * prose in backticks — a method name, an HTTP route — contribute nothing, since neither pattern
 * above matches them.
 */
export function listedPaths(section) {
  const listed = [];

  for (const line of section.split('\n')) {
    let previous = null;

    for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) {
      const token = span.trim();

      if (SIBLING_EXT.test(token)) {
        if (previous) listed.push(siblingOf(previous, token));
        continue;
      }
      for (const candidate of expandBraces(token).flatMap(expandPipes)) {
        if (!PATH_LIKE.test(candidate) && !DIR_LIKE.test(candidate)) continue;
        listed.push(candidate);
        if (!candidate.endsWith('/')) previous = candidate;
      }
    }
  }
  return listed;
}

/**
 * Compiles a listed token into a RegExp body: `**` crosses directory boundaries, a single `*` stays
 * within one segment, and every other character is literal. Scanned rather than chain-replaced so
 * that the widened forms cannot themselves be re-read as wildcards.
 */
function globBody(token) {
  let body = '';

  for (let i = 0; i < token.length; ) {
    if (token.startsWith('**/', i)) {
      body += '(?:[^/]*/)*';
      i += 3;
    } else if (token.startsWith('**', i)) {
      body += '.*';
      i += 2;
    } else if (token[i] === '*') {
      body += '[^/]*';
      i += 1;
    } else {
      body += token[i].replace(/[.+^${}()|[\]\\?]/, '\\$&');
      i += 1;
    }
  }
  return body;
}

/**
 * True when a listed token denotes `path`.
 *
 * A token may be written repo-relative — real sections shorten
 * `platform/src/test/java/ai/riviera/platform/payout/application/DailyTakingsServiceTest.java` to
 * its last two packages — so a suffix counts, but only on a `/` boundary: `venue-map.ts` must not
 * be satisfied by `admin-venue-map.ts`.
 */
function covers(token, path) {
  if (token.endsWith('/')) return path.startsWith(token) || path.includes(`/${token}`);
  if (token.includes('*')) return new RegExp(`(^|/)${globBody(token)}$`).test(path);
  return path === token || path.endsWith(`/${token}`);
}

/**
 * Paths never worth reporting. The plan docs themselves are self-evident to anyone reading one,
 * and a lockfile is a tool's output rather than a file the author chose to touch.
 */
function isExempt(path, docs) {
  return docs.some((d) => d.path === path) || /(^|\/)package-lock\.json$/.test(path);
}

/**
 * Paths a slice changed that its plan doc's File-structure section does not account for.
 *
 * @param {{ docs: { path: string, text: string }[], changed: string[] }} input the plan docs the
 *   diff touches (new-side content) and every path it changed
 * @returns {{ path: string, reason: string }[]} one entry per unlisted path, in diff order
 */
export function findOmissions({ docs, changed }) {
  if (docs.length === 0) return [];

  const sections = docs.map((d) => sectionOf(d.text));
  const listed = sections.filter((section) => section !== null).flatMap(listedPaths);
  const reason = listed.length === 0 && sections.every((section) => section === null)
    ? 'no "## File structure" section'
    : 'not listed in the File structure section';

  return changed
    .filter((path) => !isExempt(path, docs))
    .filter((path) => !listed.some((token) => covers(token, path)))
    .map((path) => ({ path, reason }));
}
