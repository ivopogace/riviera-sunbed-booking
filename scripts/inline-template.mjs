/**
 * The one decision the four template-walking guards share: **the template literal after
 * `template:` in a TypeScript file is an Angular inline template**, where an `<!-- … -->` is a
 * comment and a control is markup, and a `${…}` inside it is code. Any other template literal — a
 * spec's HTML fixture, a SQL string, a `template:` key in a `.js` file — is opaque string content.
 *
 * `check-inline-comments`, `check-comment-only`, `check-focus-posture` and `check-touch-target` each
 * walk a `.ts` file with their own scanner, and each carried its own copy of this decision until
 * the copies diverged in review. What moves here is the decision, not the scanners: a scanner keeps
 * its loop, its string and escape rules and its comment handling, feeds the code it walks into a
 * `CodeTail`, asks at a backtick, and steps a `${…}` with `interpolationStep`. Beside `git-diff.mjs`
 * because that is the guards' shared module, and dependency-free for the same reason it is: the
 * hygiene CI job runs the suites with no install step.
 */

/** The extensions whose `template:` literal is an inline template. A `.js` key is a string. */
export const INLINE_TEMPLATE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * The code before a backtick that makes its literal an inline template. Word-bounded, so a key that
 * merely ends in `template` opens a string; anchored at the end, so only whitespace — a newline and
 * an indent included — may stand between the key and the backtick.
 */
const OPENER = /\btemplate\s*:\s*$/;

/**
 * Long enough for `template:` followed by a newline and any indentation; bounded only so the string
 * a scanner carries stays short.
 */
const TAIL_LENGTH = 80;

/**
 * The code a scanner has walked up to the current backtick, with the one question that code answers.
 *
 * A scanner pushes every character it reads in code state, the line end included (the key and its
 * backtick are on different lines in most components), and resets on a string — the tail is *code*
 * before the backtick, and a string between the key and the backtick means the literal is not the
 * key's value. Comments are the scanner's own affair: it pushes them or not as its comment rule says.
 */
export class CodeTail {
  #tail = '';

  /** Appends code the scanner read; a line end is pushed as `\n`. */
  push(text) {
    this.#tail = `${this.#tail}${text}`.slice(-TAIL_LENGTH);
  }

  /** Forgets the tail, at a string. */
  reset() {
    this.#tail = '';
  }

  /**
   * Whether the backtick the scanner stands on opens an inline template, and the tail is consumed
   * either way: the literal it opens is a string or a template, never the code before the next one.
   */
  opensInlineTemplate() {
    const opens = OPENER.test(this.#tail);
    this.#tail = '';
    return opens;
  }
}

/**
 * One step of the `${…}` rule inside an inline template, for a scanner that has already handled a
 * backslash escape at `at`.
 *
 * At `depth` 0 a `${` opens an interpolation; inside one every character is code — nothing in it can
 * open an HTML comment or close the literal — and its braces are counted so a nested `{}` does not end
 * it early. The count is by brace alone: a brace inside a string inside the interpolation counts too,
 * so an unbalanced one ends the interpolation early. That simplification is the shared rule, and this
 * is the one place it is stated.
 *
 * @param {string} text the line or source being walked
 * @param {number} at the index the scanner stands on
 * @param {number} depth the interpolation depth carried in by the scanner, 0 in template text
 * @returns {{ depth: number, next: number } | null} the new depth and the index after the step, or
 *   null when `at` is template text the scanner judges itself
 */
export function interpolationStep(text, at, depth) {
  if (depth > 0) return { depth: depth + braceDelta(text[at]), next: at + 1 };
  if (text.startsWith('${', at)) return { depth: 1, next: at + 2 };
  return null;
}

function braceDelta(ch) {
  if (ch === '{') return 1;
  if (ch === '}') return -1;
  return 0;
}
