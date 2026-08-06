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

/** Matches a backticked span whose content could be a path: no spaces, and a file extension. */
const PATH_LIKE = /^[\w@][\w./@-]*\.[A-Za-z0-9]+$/;

/** Every path-shaped backticked span in the section, in source order. */
export function listedPaths(section) {
  const listed = [];
  for (const [, span] of section.matchAll(/`([^`\n]+)`/g)) {
    const token = span.trim();
    if (PATH_LIKE.test(token)) listed.push(token);
  }
  return listed;
}

/** True when a listed token denotes `path`. */
function covers(token, path) {
  return path === token;
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

  const exempt = new Set(docs.map((d) => d.path));
  const sections = docs.map((d) => sectionOf(d.text));
  const listed = sections.filter((s) => s !== null).flatMap(listedPaths);
  const reason = sections.every((s) => s === null)
    ? 'no "## File structure" section'
    : 'not listed in the File structure section';

  return changed
    .filter((path) => !exempt.has(path))
    .filter((path) => !listed.some((token) => covers(token, path)))
    .map((path) => ({ path, reason }));
}
