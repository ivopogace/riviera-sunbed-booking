# CD proves the new build is live — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the CD deploy job goes green only once the commit it deployed serves `/actuator/info` with
health `UP`, and red at the ~15-min bound otherwise.

**Architecture:** option 1 of #1632, no new secret. `monitoring`'s `BuildCommitInfoContributor`
publishes Render's runtime `RENDER_GIT_COMMIT` as `{"commit":"<sha>"}` on a public `GET /actuator/info`
(every auto-configured info contributor off). `deploy.yml` pins the hook to the CI head with `ref=`
and runs `scripts/wait-for-live-commit.mjs`. `.git` is excluded from the Docker context
(`.dockerignore`), so the git-properties plugin cannot run in the Render build; the runtime variable
needs neither `.git` nor a build arg.

**Source of intent:** GitHub issue #1632 (owner: option 1, no new secret).

**Branch:** `bugfix/cd-live-commit-1632`

## Acceptance criteria

- [x] **AC-1:** Given the old instance serving healthy with its own commit, when the new instance never
  boots, then the live check exits 1 at its deadline naming the commit still served. *Seam:*
  `wait-for-live-commit.mjs` `main` over HTTP · *Pinned by:* `wait-for-live-commit.test.mjs` "main
  exits 1 … old commit outlasts the deadline", "a new instance that never boots fails at the deadline".
- [x] **AC-2:** Given the deployed commit serving with health `UP`, then the check exits 0 and logs
  `live commit <sha>, health UP`. *Pinned by:* the same suite, "main exits 0 once live …".
- [x] **AC-3:** An anonymous `GET /actuator/info` is `200 {"commit":"<sha>"}` with no other key; an
  operator sees no more; a write or sub-path is refused; every other actuator surface keeps its status.
  *Seam:* the HTTP chain · *Pinned by:* `ActuatorHardeningIT`; value filter `BuildCommitInfoContributorTest`.
- [x] **AC-4:** `docs/deploy/cd-pipeline.md` § *The live check* describes the check.

## Non-goals

- Polling Render's API (option 2; needs a secret).

## Risks

- **R-1:** a public endpoint leaks build metadata → contributor emits a hex SHA only; defaults off.
- **R-2:** `main` moves between CI and the hook, so Render builds a later commit and the poll waits
  for one never deployed → hook `ref=<head_sha>`; CD runs are serialized by `concurrency`.
- **R-3:** only a `main` deploy exercises Render itself → stub-backed suite + a dry run of the
  workflow's own `run:` blocks; the first `main` deploy after merge is the real proof.

## Execution status

- Phase 0 (contributor + route + IT): done. Phase 1 (poll script + workflow + docs): done.
- Remaining: PR, review gate (high), Sonar, delete this plan in the last commit.
