---
name: riviera-review-overlay
description: >-
  Riviera-specific review bank items (RV-BE/RV-FE/RV-CT/RV-STYLE/RV-TEST/RV-PROC) layered onto
  an active /code-review. Load whenever reviewing a diff or PR in this repo; it adds items to a
  running review, it does not run one.
---

# Riviera review overlay

Bank items for an active review; never runs alone. On an explicit user invoke, start the
review first (`riviera-sdlc` `references/pr-gates.md` §1).

## Reference files by scope

- **Backend diff** → `references/backend-conventions.md`. Any wire-shape change (endpoint,
  DTO, error body) → also `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md`.
- **Fullstack** → all three.
- **Substrate diff** → RV-PROC-2 below.

What a build gate already enforces (JPA on the classpath, module boundaries, package shape,
domain purity, published-surface placement, Prettier, the comment guard) is not a review item:
spend review attention on what no test can see.

## Highest-stakes items (every time their domain is touched)

- **RV-BE-1** availability single source of truth (#2) — first on any
  `booking`/`availability`/beach-map diff. **Blocker**.
- **RV-CT-3 / RV-BE-7** confirmation only on a signature-verified webhook (#8). **Blocker**.
- **RV-BE-9** per-venue authorization in the application service (`assertOwns`, pinned by
  `CrossVenueDenialIT`) (#13). **Blocker**.

## RV-TEST-1 — can this assertion fail? — Major

For every test the diff adds or changes to prove a fix or a rule: would it fail if the fix were
reverted? Tautologies (white-over-white contrast, `undefined` against `not.toBeNull()`, a filter
that matches a descendant either way), assertions of the *absence* of a move or announcement, and
waits that pass on timing alone are findings. Ask for the mutation check when it isn't obvious.

## RV-STYLE-1 — prose earns its place — Minor

A comment, Javadoc/TSDoc or skill line stays only if a fresh session would act differently
(`riviera-java-conventions` §6c): flag prose that narrates the diff or states something the code
does not do. The mechanical half (one-line inline comments, doc budgets) is
`scripts/check-inline-comments.mjs`'s; don't re-flag it, and don't reflow untouched comments.

## RV-STYLE-2 — formatting is Prettier's job

CI runs `prettier --check src e2e eslint-rules`; never hand-flag formatting there. Elsewhere
(`scripts/`, `docs/`, `platform/`), match the surrounding file and lean toward leaving it.

## RV-PROC-2 — substrate claims match the tree

Fires when the diff touches `.claude/skills/**`, `CLAUDE.md`, `frontend/.claude/CLAUDE.md`,
`CONTEXT.md`, `RESPONSIBILITIES.md`, `docs/adr/**` or `docs/agents/**`, whenever a PR or review
round claims a fix, and when the diff adds or tightens a structural test: then grep the whole
substrate, files the diff never opened included, for an example the tightened rule now rejects.
Open every path, class, method and command a changed line names, and every citation of anything
the diff renamed, moved or deleted: a present-tense claim the tree does not bear out is **Major**
(a claimed fix that is not in the tree included); historical narrative is not a finding.

## Verification

Command set: CLAUDE.md §Commands. `npm test` runs Vitest in jsdom; never pass `--browsers`
(browser mode is not installed).

Red flag: `gradlew.bat` "flipped CRLF→LF" — `*.bat text eol=crlf` in `platform/.gitattributes`
stores the blob LF; only a wrong working-tree EOL is a finding.

## Output

Findings join the host review's numbered list (the `code-review` plugin's one `### Code review`
PR comment), each prefixed with its RV id and severity (`RV-BE-9 (Blocker): …`), cited and
linked like the host's own and counted in its "Found N issues". Done when every scope-loaded item
is checked; RV-BE-11 whenever behaviour is added/moved, RV-BE-19 on any choice/calculation/
lifecycle change, RV-TEST-1 on every changed test, RV-PROC-2 whenever its trigger fires.
