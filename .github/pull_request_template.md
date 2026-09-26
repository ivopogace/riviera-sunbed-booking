<!--
Riviera SDLC PR template. Fill what applies; drop what doesn't.
"Green CI" is necessary, not sufficient — the review gate must have run.
-->

## What & why

<!-- One or two sentences. What slice is this and what does it deliver? -->

Closes #<!-- issue -->

## Acceptance criteria → tests

<!-- Every AC from the issue/plan, each with the test that proves it.
     An AC with no passing test is not done. -->

- [ ] **AC-1:** <given/when/then> — pinned by `<TestClass.method>`

## Invariants touched

<!-- Only the CLAUDE.md invariants this diff can break, each with how it holds and the test that
     pins it — e.g. "#2: the stay claims every (set, date) with ON CONFLICT DO NOTHING;
     ConcurrentReservationIT.twoStays". Write "none" when none apply. -->

## Gates

- [ ] CI is green (build + tests + scans).
- [ ] Tests run for real (Testcontainers ITs **not** skipped — `skipped=0`).
- [ ] **Review gate run** — `code-review` on this PR plus `riviera-review-overlay`
  (riviera-sdlc `references/pr-gates.md` §1); findings resolved or deferred with a follow-up issue.
  <!-- If tooling blocked the review, LEAVE THIS UNTICKED and say so in Scope notes. -->
- [ ] **Sonar gate** — no new bug, vulnerability or unreviewed hotspot; new-code coverage ≥ 80%.
- [ ] **Plan doc removed** in this PR's last commit, its durable rationale moved to
  `RESPONSIBILITIES.md`, an ADR or the issue. *(or N/A — no plan doc)*

## Contribution terms

- [ ] I accept `LICENSE` §5 and `CLA.md`: everything in this PR is assigned to the owner on
  submission, I retain no rights in it, and any third-party material is identified with its
  license. <!-- First PR? Post the acceptance comment from CLA.md §13 on this PR. -->

## Scope notes

<!-- Anything intentionally deferred / out of scope, with where it lands. -->
