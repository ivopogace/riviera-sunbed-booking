# The inline-comment guard — scope, exemptions, and the deliberate false negative

Read when `scripts/check-inline-comments.mjs` fires on an edit, or before touching its
scope. The authoring rule it enforces is SKILL.md §6c. Every scope gap below is deliberate.

- **Diff-scoped for anything git already tracks.** It judges only lines a diff added; the
  existing tree carries many pre-existing multi-line inline comments that a repo-wide gate
  would go red on. Don't reflow untouched comments. The exception is a file git has never
  seen, which `--files` and the hook judge whole — a new file has no diff against `HEAD`,
  and every line in it is the author's.
- **Four languages, by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`,
  `.scss`/`.css`, `.html`. **Not** `#` files (shell, YAML, `.properties`) — every one of
  those in this repo carries multi-line `#` header prose by convention — and **not** SQL
  `--` (declined by review precedent, `V9__payout_ledger.sql`).
- **Two exemptions beyond the doc-comment carve-out:** a block comment standing before any
  code is the file's header (`tailwind.css` opens with one), and only whole-line comments
  merge into a block, so a trailing comment never pairs with the next line's.
- **One deliberate false negative — do not "fix" it.** It groups only added comment lines,
  and flags a block comment only when the diff wrote its opening line. So appending a
  second line to a comment that was already there reads as a one-line addition and passes.
  The alternative — grouping every adjacent comment line and asking whether any was added —
  flags a whole pre-existing block because you parked one compliant one-liner beneath it
  (`SecurityConfig` alone carries 25 such blocks). That false positive is how a gate gets
  switched off; the false negative leaves the case to review (RV-STYLE-1).
