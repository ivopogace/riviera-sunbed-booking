# The comment-and-prose guard — `scripts/check-inline-comments.mjs`

Read when it fires or before touching its scope. Every gap below is deliberate — don't "fix" one.

Rules:

- **`multiline`** (gates) — an added inline comment in production source spans more than one
  line.
- **`multiline-test`** (advises only) — the same shape in test source (`*.spec|e2e|test.*`,
  `platform/src/test/`, `frontend/e2e/`, `frontend/src/testing/`).
- **`history`** (advises only) — `no longer`, `previously`, `used to be`, `this change`.
- **`docbudget`** (gates) — a doc comment the diff wrote whole is over §6d's budget: 6 non-blank
  text lines for a type, 3 for a member. What it documents is the first code after it, past
  annotations and decorators; a file or package header, or a doc another comment follows,
  counts as a type. Production source only: `platform/src/main/java` and `frontend/src`, not
  `*.spec.ts`, `*.fixtures.ts`, `*.mocks.ts` or `frontend/src/testing/`.
- **`docbudget-touched`** (gates) — the same, for an older block the diff edited: a touched doc
  comment is judged whole. `scripts/check-doc-budget.mjs` (standing-tree, CI) holds the tree at
  its baseline, now 0 lines over budget: the total may only fall, and `--update` never raises it.
  `--report` lists the heaviest areas and files.
- **`respbudget`** / **`respbudget-touched`** (gate) — the same budget for `RESPONSIBILITIES.md`:
  each block is at most 8 non-blank lines. A block is one list item with every line up to the
  next item, or one paragraph; blank lines, headings, table rows and fenced code end a block and
  count toward none.

An issue or PR number is not a finding anywhere: it is a lookup key.

Scope:

- **Added lines only** for tracked files; a file git has never seen is judged whole.
- **A touched doc comment is judged whole** — every line of a `/** … */` block with any added
  line.
- **Skill markdown:** `.claude/skills/<skill>/SKILL.md` and `references/*.md`, outside fenced
  code, code spans removed (history tell only). Not `CLAUDE.md`, `docs/` or ADRs.
- **Languages by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`, `.scss`/`.css`,
  `.html`. In `.ts`, the template literal after `template:` is an Angular inline template
  (an `<!-- -->` there is a comment, `${…}` is code); any other template literal is opaque.
  **Not** `#` files (shell, YAML, `.properties`) and **not** SQL `--`.
- **Exempt from one-line:** doc comments; a block comment before any code (file header).
  Only whole-line comments merge into a block.
- **Deliberate false negative:** a block is flagged only when the diff wrote its opening
  line, so appending a line to an existing comment passes.
