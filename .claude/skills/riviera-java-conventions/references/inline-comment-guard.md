# The comment-and-prose guard — scope, exemptions, and the deliberate false negative

Read when `scripts/check-inline-comments.mjs` fires on an edit, or before touching its
scope. The authoring rule it enforces is SKILL.md §6c. Every scope gap below is deliberate.

Three rules, one guard:

- **`multiline`** (gates) — an inline comment the diff added spans more than one line.
- **`provenance`** (gates) — an issue or PR number in an added skill line, an added inline
  comment, or anywhere in a doc comment the diff touched. `issue N` and `PR N` always count; a
  bare `#NNN` counts only in a citing position — after `(`, `/`, a comma, or a citing word
  (`issue`, `PR`, `epic`, `since`, `until`, `before`, `after`, `by`, `in`, `the`, …). `: #123`
  or `is #123` reads as a colour and is left to review: a false negative, by design.
- **`history`** (advises) — `no longer`, `previously`, `used to be`, `this change` and the
  like. Printed, never failing: a port that "releases a `previously` claimed set" is stating
  its contract.

Scope:

- **Diff-scoped for anything git already tracks.** It judges only lines a diff added; the
  existing tree carries many pre-existing multi-line inline comments and issue-numbered doc
  comments that a repo-wide gate would go red on. Don't reflow untouched comments. The
  exception is a file git has never seen, which `--files` and the hook judge whole — a new
  file has no diff against `HEAD`, and every line in it is the author's.
- **A touched doc comment is judged whole** — every line of a `/** … */` block with at least
  one added line, including the lines the diff never wrote. That is the rule, not a gap:
  editing an old Javadoc means re-reading it. Only the comment's own text is read; code on the
  same line before the opener or after the closer never is.
- **Skill markdown:** `.claude/skills/<skill>/SKILL.md` and its `references/*.md` — added
  lines only, outside fenced code and with code spans removed. Not the triage skill's
  `OUT-OF-SCOPE.md` (a ledger of issue numbers by design), and not `CLAUDE.md`, `docs/` or
  the ADRs — those are RV-PROC-2's.
- **Four languages, by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`,
  `.scss`/`.css`, `.html`. **Not** `#` files (shell, YAML, `.properties`) — every one of
  those in this repo carries multi-line `#` header prose by convention — and **not** SQL
  `--` (declined by review precedent, `V9__payout_ledger.sql`).
- **Two exemptions from the one-line rule beyond doc comments:** a block comment standing
  before any code is the file's header (`tailwind.css` opens with one), and only whole-line
  comments merge into a block, so a trailing comment never pairs with the next line's.
- **One deliberate false negative — do not "fix" it.** The one-line rule groups only added
  comment lines, and flags a block comment only when the diff wrote its opening line. So
  appending a second line to a comment that was already there reads as a one-line addition
  and passes. The alternative — grouping every adjacent comment line and asking whether any
  was added — flags a whole pre-existing block because you parked one compliant one-liner
  beneath it (`SecurityConfig` alone carries dozens). That false positive is how a
  gate gets switched off; the false negative leaves the case to review (RV-STYLE-1).
