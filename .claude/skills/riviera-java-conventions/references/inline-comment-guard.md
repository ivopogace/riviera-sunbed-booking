# The comment-and-prose guard — `scripts/check-inline-comments.mjs`

Read when it fires or before touching its scope. Every gap below is deliberate — don't "fix" one.

Three rules:

- **`multiline`** (gates) — an added inline comment spans more than one line.
- **`provenance`** (gates) — an issue/PR number in an added skill line, an added inline
  comment, or anywhere in a touched doc comment. `issue N` / `PR N` always count; a bare `#NNN`
  only in a citing position (after `(`, a comma, `NNN/`, a citing word from `CITING` in the
  guard, or opening the comment). `: #123` (a colour) and `the #404 error` are left to review.
  A colour in a citing position (`// #123 is the emphasis colour`, `(#333)`, `in #333`) is a
  false positive — rewrite as `the #333 colour`.
- **`history`** (advises only) — `no longer`, `previously`, `used to be`, `this change`.

Scope:

- **Added lines only** for tracked files; a file git has never seen is judged whole.
- **A touched doc comment is judged whole** — every line of a `/** … */` block with any added
  line.
- **Skill markdown:** `.claude/skills/<skill>/SKILL.md` and `references/*.md`, outside fenced
  code, code spans removed. Not `OUT-OF-SCOPE.md`, not `CLAUDE.md`, `docs/` or ADRs
  (RV-PROC-2's).
- **Languages by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`, `.scss`/`.css`,
  `.html`. In `.ts`, the template literal after `template:` is an Angular inline template
  (an `<!-- -->` there is a comment, `${…}` is code); any other template literal is opaque.
  **Not** `#` files (shell, YAML, `.properties`) and **not** SQL `--`.
- **Exempt from one-line:** doc comments; a block comment before any code (file header).
  Only whole-line comments merge into a block.
- **Deliberate false negative:** a block is flagged only when the diff wrote its opening
  line, so appending a line to an existing comment passes. Grouping every adjacent line would
  flag whole pre-existing blocks; that case is left to review (RV-STYLE-1).
