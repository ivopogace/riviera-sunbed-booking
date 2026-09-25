---
name: riviera-review-overlay
description: >-
  Riviera-specific review bank items (RV-BE/RV-FE/RV-CT/RV-STYLE/RV-PROC) layered onto an
  active /code-review. Load whenever reviewing a diff or PR in this repo; it adds items to
  a running review, it does not run one.
---

# Riviera review overlay

Bank items for an active review; never runs alone. On an explicit user invoke, start the
review first (`riviera-sdlc` `references/pr-gates.md` §1). Announce: *"riviera-review-overlay
loaded. Adding project-specific bank items."*

## Reference files by scope

- **Backend diff** → `references/backend-conventions.md`. Any wire-shape change (endpoint,
  DTO, error body) → also `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md`.
- **Fullstack** → all three.
- **Substrate diff or a changed structural test** → RV-PROC-2 below.

## Highest-stakes items (every time their domain is touched)

- **RV-BE-1** availability single source of truth (#2) — first on any
  `booking`/`availability`/beach-map diff. **Blocker**.
- **RV-CT-3 / RV-BE-7** confirmation only on a signature-verified webhook (#8). **Blocker**.
- **RV-BE-9** per-venue authorization in the application service (`assertOwns`, pinned by
  `CrossVenueDenialIT`) (#13). **Blocker**.

## RV-STYLE-1 — prose earns its place

Every added/touched line of prose (skill, Javadoc/TSDoc, inline comment) stays only if a fresh
session would act differently (`riviera-java-conventions` §6c). **Minor** findings: a
multi-line inline comment; an issue/PR number in an added skill line, added inline comment or
touched doc comment; prose that narrates the diff or records history. A touched doc comment over
§6d's budget is **Major** (the guard gates it, new or edited); a trim that lowered the total
needs the committed `check-doc-budget.mjs --update` baseline. Run
`node scripts/check-inline-comments.mjs --diff origin/main` (also a hook and a CI job) for the
mechanical half; it does not cover `#`/SQL `--` comments or a one-liner that shouldn't exist.
Don't reflow untouched comments.

## RV-STYLE-2 — formatting is Prettier's job

CI runs `prettier --check src e2e eslint-rules`; never hand-flag formatting there. Elsewhere
(`scripts/`, `docs/`, `platform/`), match the surrounding file and lean toward leaving it.

## RV-PROC-1 — routing gate honoured

Cross-check the plan's **Skills consulted** line against what the diff touches per the
`riviera-sdlc` routing table. A touched area with no matching skill is **Major**: load it,
re-vet the section, update the line. Re-walk every re-review.

## RV-PROC-2 — substrate verified against the tree

Fires when the diff touches `.claude/skills/**`, `CLAUDE.md`, `frontend/.claude/CLAUDE.md`,
`CONTEXT.md`, `RESPONSIBILITIES.md`, `docs/adr/**`, `docs/agents/**`, or adds/tightens a
fitness function (a test that fails the build on a rule over production code: ArchUnit,
`verify()`, a classpath probe, an endpoint census). Three checks, re-walked every re-review:

**a. Citations resolve.** Open every path, line range, class and method named on a changed
line, plus every citation of anything the diff renamed, moved or deleted. **Major** when the
diff's own rename broke it, **Minor** otherwise.

**b. Worked examples still hold.** Code examples are held to the structural net
(`riviera-modulith` § *The structural net*; members in `CLAUDE.md` §Commands). Walk every
example on a changed line; when the diff tightens a net member, walk **every** substrate
example, including files the diff never opened. A tightened target-naming test → grep the
substrate for the names read out of the test. Sweep for the test's own forbidden set:

```bash
SUBSTRATE='.claude/skills CLAUDE.md frontend/.claude/CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents'
grep -rln '^```java' $SUBSTRATE
grep -rnE 'import (org\.springframework|java\.sql|javax\.sql|com\.stripe)' $SUBSTRATE   # DomainPurity's list
```

A **command** is an example too: run it and match what it reaches against every coverage
claim in the document. **Major**.

**c. `riviera-docs-freshness` step 2a** over every name the diff's `-` lines carry that the
tree no longer answers to (class, file, test, command, setting, label, item name, count).
A hit is **Major** only when the line states as present fact something the tree does not bear
out; historical narrative is not a finding. When the diff lands or re-decides an ADR, add the
skill's step 3 over docs that stated the old position.

## Verification

Command set: CLAUDE.md §Commands. Modulith verification is
`./gradlew test --tests "*ModularityTests*"`; `npm test` has no `--browsers` flag.

Red flag: `gradlew.bat` "flipped CRLF→LF" — `*.bat text eol=crlf` in `.gitattributes` stores
the blob LF; only a wrong working-tree EOL is a finding.

## Output

Pre-impl checklist: one top-level `### Riviera overlay (if loaded)` section after the FE↔BE
contract section, one bullet per item, ✅/❓/⛔. Peer-review notes: `### Riviera overlay` under
`## Convention checks`; `### Recommended riviera skills` on any hand-off. Done when every
scope-loaded item is checked; RV-BE-11 whenever behaviour is added/moved, RV-BE-12 on package
moves, RV-BE-19 on any choice/calculation/lifecycle change, RV-PROC-2 whenever its trigger fires.
