---
name: riviera-review-overlay
description: >-
  Riviera-specific review bank items (RV-BE/RV-FE/RV-CT/RV-STYLE/RV-PROC) layered onto an
  active /code-review. Load whenever reviewing a diff or PR in this repo; it adds items to
  a running review, it does not run one.
---

# Riviera review overlay

Bank items, severity hints, and verification commands contributed to an active review. It
is content, not a workflow: it never runs alone. Load when a review is active (`/code-review`
or another engine) and the work is in this repo; on an explicit user invoke, start the
review first (the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1).
`/security-review` doesn't auto-load this overlay; consult the reference files directly.

When loaded, announce: *"riviera-review-overlay loaded. Adding project-specific bank items."*

## Reference files, loaded by the diff's scope

- **Backend diff** → `references/backend-conventions.md` (RV-BE-1..19: JDBC-only, Modulith
  boundaries, availability/concurrency, money/timezone, auth, error contract, responsibility
  placement, package shape, rule-layer placement, Flyway, session lifecycle). If the diff changes any wire shape
  (an endpoint, a DTO, an error body) — even with no frontend file touched — also load
  `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md` (Angular standards, Tailwind,
  forms, beach-map stale-availability handling, money/date rendering, no client secrets,
  e2e suite placement, RV-FE-8 no new cross-feature import, RV-FE-9 focus moves on
  destroy, RV-FE-10 live regions outlive their content, RV-FE-11 field errors name their
  control).
- **Fullstack diff** → both, plus `references/fe-be-contract.md`.
- **Substrate diff, or a change to a structural test** → no reference file; RV-PROC-2 below
  is the item, and its opening paragraph states the trigger. "Only style items applied" is the
  failure mode it prevents.

## Highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Checked first on any
  diff touching `booking`/`availability`/the beach map. Default **Blocker**.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** A booking is confirmed
  only on a signature-verified webhook, never the client redirect. Default **Blocker**.
- **RV-BE-9 Per-venue authorization / BOLA (invariant #13).** A touched venue-scoped
  surface verifies the operator owns the path `venueId` in the application service
  (`assertOwns`, pinned by `CrossVenueDenialIT`). Default **Blocker**.

## RV-STYLE-1 — comments and skill prose earn their place

One test for every line of prose the diff adds or touches — in a `riviera-*` skill or its
`references/`, a Javadoc/TSDoc, an inline comment: keep it only if a fresh session reading it
would act differently (`riviera-java-conventions` §6c holds the drop and keep lists). Findings:

- A multi-line inline comment the diff wrote (`//`, `#`, `/* … */`, `<!-- … -->` inside a
  body, template, or between statements) — **Minor**. Doc comments are exempt from the
  one-line rule only.
- Provenance (an issue or PR number) in an added skill line, an added inline comment, or
  anywhere in a doc comment the diff touched — **Minor**; the fix is drop or relocate (§6d),
  never "it was already there".
- Prose that narrates the diff, restates the code, or records history the reader never saw —
  **Minor**, and the half the guard cannot see: judge it by the test.

Run the guard rather than walking it by hand: `node scripts/check-inline-comments.mjs
--diff origin/main` (also a `PostToolUse` hook and a CI job). It is diff-scoped; a clean run
discharges the mechanical half, and its advisory lines on history phrasing are worth reading.
What it does not cover: `#` files (shell, YAML, `.properties`) and SQL `--` — judge by eye
and lean toward leaving them alone — and a one-line comment that shouldn't exist at all
(the rule's other half is "default to zero inline comments in a method"). Don't reflow
untouched comments.

## RV-STYLE-2 — formatting is `prettier --check`'s job, not the reviewer's

The frontend job's Format step runs `prettier --check src e2e` whole-scope, so don't
hand-flag `printWidth`, quote style, or wrapping in `frontend/src` or `frontend/e2e` — a
misformatted line would have failed the PR. A dirty file is fixed with `npm run format`,
never by a review comment. Outside that scope (`scripts/`, `docs/`, `platform/`, and
`frontend/`'s root files — tool- or prose-owned, listed in `.prettierignore`), formatting
is a matter of matching the surrounding file; judge by eye, lean toward leaving it alone.

## RV-PROC-1 — skill-routing gate honored (when a plan doc is in scope)

Cross-check the plan doc's **Skills consulted** line against what the diff touches, per
the `riviera-sdlc` Skill-routing table. A touched area with no matching skill listed (or no
such line) is a **Major** finding — load the missing skill, re-vet that section, update the
line. Re-walk on every re-review, including review-fix commits.

## RV-PROC-2 — substrate changes are verified against the tree, not read as prose

Fires whenever the diff touches what every future session reads as instructions:
`.claude/skills/**` (`SKILL.md` **and** `references/`), `CLAUDE.md`,
`frontend/.claude/CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, `docs/adr/**`,
`docs/agents/**` — or adds/tightens a fitness function, which falsifies substrate examples
from the other direction. A fitness function is recognised from the diff, never looked up in a
list: a test that fails the build on a rule over production code the diff need not touch — an
ArchUnit rule, Modulith's `verify()`, a classpath probe, an endpoint census.
`RESPONSIBILITIES.md` § *Machine-checked vs review-checked* lists the ones that enforce a clause
of that file, and the tree holds more. Such a diff
otherwise draws only RV-STYLE-1/2, and those read the prose, never whether it is still true.

**a. Every citation still resolves.** Skills cite the tree by name and line
(`BookingStatus.java`, `JdbcAvailabilityClaim`, `V4__availability.sql:32`); a rename or a
moved line silently falsifies them. Open every path, line range, class and method named on a
changed line, plus every citation of anything this diff renamed, moved or deleted.
**Major** when the diff's own rename broke the pointer, **Minor** for one it merely sat beside.

**b. Every worked example still holds — code against the structural net, a command against
its own coverage claims.** An example is code a session
will copy, so it is held to the same rules as code — the structural net, whose membership rule
and members are `CLAUDE.md` §Commands. The net is the right set because an example is
target-free code: it shows a shape, in a module that is often hypothetical, and the net's members
are exactly the rules that reject a shape wherever it sits. Walk it both ways. First, every
example on a changed line, against the net as it stands. Second, the way that bites: when the
diff adds or tightens a member of the net, re-walk **every** example in the substrate,
**including files the diff never opened** — the example that breaks is by definition not in
the diff. A fitness function outside the net names its target (`ErrorContractArchitectureTests`
the exception-handler annotations, `ResponsibilitiesArchitectureTests` a table or a module, an
`*AuthPlacementTests` one module), so tightening one puts a narrower walk due: grep the substrate
for the names read out of the test and walk those hits alone — an example that never names the
target cannot break. A diff that adds a rule of any other kind (a review item, a skill's prose
rule, a guard script) gets the first walk alone. Locate the examples, then sweep for the
tightened test's own forbidden set, read out of the test rather than remembered. Both commands run over the path set the trigger names and no wider:
a research note (`docs/research/`, `docs/architecture/research/`) records what was true when
written, not an instruction a session copies, and nothing else under `docs/` is substrate.

```bash
SUBSTRATE='.claude/skills CLAUDE.md frontend/.claude/CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents'
grep -rln '^```java' $SUBSTRATE
# e.g. DomainPurityArchitectureTests' Forbidden list:
grep -rnE 'import (org\.springframework|java\.sql|javax\.sql|com\.stripe)' $SUBSTRATE
```

**Major** — an example the net rejects reddens the next session's build, docs-only diff or not.

A **command** is a worked example too, and the one a session is likeliest to run verbatim, so it
gets the same treatment against a net of its own. The unit is the pair — the command, and the
prose claiming what it covers — and touching **either** side puts the check due; widening a map
without widening the grep beneath it is the commoner half. Run the command, and match what it
actually reaches against every coverage claim in the document, including claims on lines the diff
never touched. **Major** — a procedure that cannot reach its own stated scope reports zero
findings, which reads as good news.

**c. `riviera-docs-freshness` step 2a over what the diff removed or renamed.** A deletion
that leaves a pointer dangling elsewhere in the substrate is found here, at review time,
instead of surviving to the next close-out. Removed or renamed wording is a name the diff's
`-` lines carry and the tree after the diff does not answer to — a class, file, test,
command, setting, label or item name, or a stated count — whether the diff deleted it or put
a new name in its place. Wording the diff generalized, reworded, or set a sibling beside (the old
item stays, a new one joins it) retired nothing: there is nothing to hand to the grep, and
this check is N/A. Hand each retired name to the skill's rename/removal grep, then judge
every hit against the tree, not the grep: a hit is a finding only when the diff falsified it
— the line states, as present fact, a name, path, count or mechanism the tree does not
bear out — and that is **Major**. A hit the diff left true (the sentence still describes the
tree as it now stands) is not a finding, and neither is one in historical narrative (an
ADR's Context paragraph, a research note). When the diff lands or re-decides an ADR, add the
skill's step 3 over the docs that stated the old position — a promise the decision has just
retired matches no identifier. Re-walk all three checks on every re-review, including
review-fix commits.

## Verification commands

The command set is CLAUDE.md §Commands. Modulith verification is a test, not a Gradle task
(`./gradlew test --tests "*ModularityTests*"` when structure changed); `npm test` is
Vitest-in-jsdom — there is no `--browsers=ChromeHeadless` flag.

## Red flags specific to this repo

| Thought | Reality |
|---|---|
| "`gradlew.bat` flipped CRLF→LF — that's corruption, revert it." | Check `.gitattributes` at every level (incl. `platform/.gitattributes`) first: `*.bat text eol=crlf` stores the blob LF and checks out CRLF, so an LF blob is the correct normalized form. Only a wrong working-tree EOL is a finding. |

The authoring-idiom red flags (JPA/Lombok, float money, JVM-default-zone time,
cross-module service calls, multi-line comments) live in `riviera-java-conventions`.

## Output integration & done criteria

- Pre-impl checklist: fill the single top-level `### Riviera overlay (if loaded)` section
  (after the FE↔BE contract section), one bullet per item, ✅/❓/⛔. Peer-review notes: fill
  the `### Riviera overlay` subsection under `## Convention checks`; append
  `### Recommended riviera skills` on any hand-off.
- Done when every item in the scope-loaded reference files is checked and the three
  highest-stakes items are addressed whenever their domain is touched.
- RV-BE-11 checked whenever the diff adds or moves behavior (plan's Module-ownership table
  reconciled against where the code landed); RV-BE-12 whenever it adds or moves packages;
  RV-BE-19 whenever it adds or changes a choice, calculation or lifecycle statement.
- RV-PROC-2 checked whenever its own trigger fires — including on a docs-only diff, where it is
  usually the only non-style item that applies.

## Hand-offs

The overlay recommends, it does not execute: payment/payout details →
`riviera-stripe-payments`; plan-doc gaps (missing AC, stale execution status) →
`riviera-plan-doc`; substrate drift a review turned up (RV-PROC-2) → `riviera-docs-freshness`;
module-boundary questions → `codebase-design`; Java idiom violations →
`riviera-java-conventions`. `triage` manages the issue lifecycle around the review (PRs
are not a triage surface — `docs/agents/issue-tracker.md`).
