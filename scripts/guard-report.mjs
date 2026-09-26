/**
 * What a template guard (`check-touch-target.mjs`, `check-focus-posture.mjs`) prints under its
 * headline: one line per violation, then each distinct rule's advice once.
 */

/** One `path:line  [rule]  text` line per violation. */
export function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}  [${v.rule}]  ${v.text}`).join('\n');
}

/** An `advise(violations)` that prints each distinct rule's entry in `advice` once, first-seen order. */
export function adviser(advice) {
  return (violations) =>
    [...new Set(violations.map((v) => v.rule))].map((rule) => advice[rule]).join('\n');
}
