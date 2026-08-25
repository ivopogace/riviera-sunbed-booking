# The inline-comment guard — scope, exemptions, and the deliberate false negative

Read this when `scripts/check-inline-comments.mjs` fires on an edit, or before touching
its scope. The authoring rule it enforces is SKILL.md §6c; this file is the guard's
mechanics — and every scope gap below is **deliberate**, with the incident that earned it.
Do not "fix" any of them without reading its entry first.

- **Diff-scoped for anything git already tracks.** It judges only lines a diff *added*. The existing
  tree carries many pre-existing multi-line inline comments that read as established convention in
  their own files; a repo-wide gate would go red on day one and get switched off. Don't reflow
  untouched comments. The one exception is a file git has **never seen**, which `--files` and the
  hook judge whole (#619): a new file has no diff against `HEAD`, so the diff-scoped path called it
  clean — and a new file is the commonest way a violation enters the tree. Every line in it is
  yours, so there is nothing of anyone else's to bury you in.
- **Four languages, by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`, `.scss`/`.css`,
  `.html`. **Not** `#` files (shell, YAML, `.properties`) — every one of those in this repo carries
  multi-line `#` header prose as its documented convention — and **not** SQL `--`, which #522's
  finding F-6 declined by precedent, citing `V9__payout_ledger.sql`.
- **Two exemptions beyond the doc-comment carve-out:** a block comment standing before any code is
  the file's header (`tailwind.css` opens with one), and only whole-line comments merge into a
  block, so a trailing comment never pairs with the next line's.
- **One deliberate false negative — do not "fix" it.** A violation must be something the diff
  *wrote*: it groups only **added** comment lines, and flags a block comment only when the diff
  wrote its **opening** line. So appending a second line to a comment that was already there
  reads as a one-line addition and passes. The alternative — grouping every adjacent comment line
  and then asking whether any was added — flags a whole pre-existing block because you parked one
  compliant one-liner beneath it, quoting text you never wrote. `SecurityConfig` alone carries 25
  such blocks. That false positive is how the gate gets switched off; the false negative just
  leaves the case to review, which is what RV-STYLE-1 is still for. (Found at this slice's own
  review gate, after the guard shipped with the bug it exists to prevent.)
