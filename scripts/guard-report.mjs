/**
 * What a template guard (`check-touch-target.mjs`, `check-focus-posture.mjs`) prints under its
 * headline: one line per violation, then each distinct rule's advice once. `--all` prints a tally.
 */

/** One `path:line  [rule]  text` line per violation. */
export function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}  [${v.rule}]  ${v.text}`).join('\n');
}

/** The `--all` sweep's output: the violations, if any, then a count for each of `rules`. */
export function tally(violations, rules) {
  const counts = rules
    .map((rule) => `${rule}: ${violations.filter((v) => v.rule === rule).length}`)
    .join('  ');
  const listing = violations.length ? `${report(violations)}\n` : '';
  return `${listing}${counts}\n`;
}

/** An `advise(violations)` returning each distinct rule's entry in `advice` once, first-seen order. */
export function adviser(advice) {
  return (violations) =>
    [...new Set(violations.map((v) => v.rule))].map((rule) => advice[rule]).join('\n');
}
