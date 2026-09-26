# <Feature Title> Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** <one sentence; concrete, falsifiable>

**Architecture:** <2–3 sentences; the single most significant decision and why>

**Persistence:** JDBC only (invariant #1). <tables/migrations touched>

**Source of intent:** <spec path and/or GitHub issue #NN>

**Skills consulted:** `riviera-sdlc` (<what the intake gate caught>) · `riviera-plan-doc`
(<what this template forced>) · `tdd` (<how it was built test-first>) ·
`riviera-review-overlay` (<when the gate ran>) · `riviera-docs-freshness` (<**ran** over
`<range>`, N findings — or `N/A — <reason>`>) · <every routed skill + one phrase on what it
changed, e.g. `postgres` (BIGINT identity PKs)>

> Extend the five pre-filled entries, don't replace them. Every area the diff touches must
> appear; RV-PROC-1 checks this line against the diff.

**Branch:** `<feature|bugfix>/<short-slug>` <exists before phase 0>

---

## Acceptance criteria (testable)

> Mandatory before phase 0. Given/When/Then, naming a test, written at the inner hexagon in
> domain terms (`AvailabilityClaim` succeeds, `BookingConfirmed` is published), never the
> button, redirect or HTTP status alone. *Seam* names the public boundary observed through
> (port/interface/route, not the class under test); prefer an existing, highest seam. A phase
> needing an unnamed seam stops and adds it here first. Approval of this doc is `tdd`'s
> confirm-seams step.

- [ ] **AC-1:** Given <precondition>, when <action>, then <outcome>. *Seam:* `<…>` · *Pinned by:* `<TestClass>.<method>`
- [ ] **AC-2:** ...

## Non-goals

- <thing the feature might imply but we are not doing>

## Behavior-parity ledger (retirement / replacement slices only)

> Mandatory when the slice retires or replaces a surface; otherwise `N/A — replaces nothing`.
> Every old behaviour (re-reads, error paths, retries, empty/loading states, 401/403 handling,
> redirects, background refreshes) marked preserved / changed / dropped with reason.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| | | |

## Risk register

> Fill before phase 0 (`grilling` if risks aren't visible). Standing categories: concurrent
> reservation (#2), webhook duplicate/out-of-order (#8), payout double-accrual (#9), timezone,
> sales close and cancellation cutoff (#4/#6/#10), rounding (#5), boundary leaks (#11), BOLA on
> any venue-scoped surface (#13 — say how ownership is verified in the service), JPA or Stripe
> Connect temptation. New DTO/error → error-contract note (`riviera-java-conventions` §6b).
> Flyway → claim `V<n>` per the intake gate (free on `main` AND unclaimed by open PRs; who
> renumbers).

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | | | | | | open / commit-sha |

## Open questions / Assumptions

> Work is NOT done while this has unresolved entries.

- **Assumption:** <…> — *Owner:* <…> · *Resolves by:* <…>
- **Open question:** <…> — *Owner:* <…> · *Resolves by:* <…>

Resolved entries move under `### Resolved` with outcome + SHA.

## Availability & concurrency (invariant #2)

> Mandatory if the feature touches `booking`, `availability` or the beach map; otherwise
> `N/A — does not affect availability` and why.

- **Write paths to `set_availability(set_id, booking_date)`:** <every channel in scope>
- **Uniqueness guarantee:** <the DB constraint>
- **Concurrency strategy:** <`SELECT … FOR UPDATE` | `INSERT … ON CONFLICT DO NOTHING` | other, and why>
- **Pool rule (#3):** <…>
- **Cutoff rule (#4):** <the venue's `sales_close` fence, `Europe/Tirane`; cancellation's separate boundary if in scope>
- **Pinning test:** `<ConcurrentReservationIT.<method>>`

## Spring Modulith — modules, interfaces, events

> Mandatory if any backend code; frontend-only: `N/A — frontend-only`.

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | | | | |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | | | | |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | | | | | | |

### Module ownership (§4a)

> Required whenever behaviour is added or moved. Justification cites the owner's **Job** line
> and confirms no other module's **Not My Job** list rejects it (`RESPONSIBILITIES.md`).
> Watch the splits: `booking` decides refunds / `payment` executes; `venue` stores the
> commission rate / `payout` computes. Single module, no boundary change → one line.

| Capability | Owner module | Justification |
|---|---|---|
| | | |

## Payment & payout (invariants #5, #8, #9, #10)

> Mandatory if money moves; otherwise `N/A — no payment in scope`. Load `riviera-stripe-payments`.

- **Model:** collect-only via Stripe, no Connect; payout via manual BKT batch.
- **Confirmation trigger:** signature-verified webhook.
- **Idempotency:** <keys on charge/refund; webhook dedupe on event id>
- **Money:** integer minor units, EUR.
- **Payout-ledger effect:** <accrual on confirm, reversal on refund; exactly-once>
- **Refund policy applied:** <…>
- **Pinning tests:** <…>

## Angular — frontend surfaces touched

> Mandatory if frontend is in scope; backend-only: `N/A — backend-only`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | | | | | |

## FE↔BE contract

> Mandatory if an API shape changes; otherwise `N/A — no contract change`.

- **New/changed endpoints:** <method + path + DTO>
- **Client typing:** <generated or hand-typed; never `as any`>
- **Money/date on the wire:** minor units + currency; ISO `LocalDate`.

## Execution status

> The session-recovery anchor: re-read it (plus the current stage's `riviera-sdlc` reference)
> after a compaction or when unsure. Update in the same commit window as what it records.
> Finalize BEFORE the merge, in the PR's last code-touching commit, never in a commit of its
> own; record `merged via PR #NN`, never a SHA (`riviera-sdlc` `references/pr-gates.md` §3 step 4).

**Stage pointer:** <e.g. `implement (phase 2)` / `review gate — fixing findings` / `merge close-out step 3`>

**Next action:** <one line>

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — <name> | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | | | open / fixed-in-`<sha>` / deferred → issue #NN |

---

## File structure

> Every path in the diff, including one-liners — CI fails the PR on an unlisted path. Check
> before pushing (plan doc staged or committed first, else the guard short-circuits):
>
> ```bash
> node scripts/check-plan-file-structure.mjs --diff origin/main
> ```
>
> Accepts repo-relative paths, sibling extensions, brace sets, `a.ts|.html`, directories, globs.
> Exempts plan docs and `package-lock.json`. A file you never intend to commit goes behind an ignore
> rule.

- `<path>` — <responsibility>

---

## Phase 0 — <Phase name>

**Files:** Create `<path>` · Modify `<path>:<lines>` · Test `<path>`

- [ ] **Step 1: Write the failing test**

```<lang>
<actual test code>
```

- [ ] **Step 2: Run it, verify it fails** — `<exact command>` → FAIL with `<message>` (one test class, never the full suite)
- [ ] **Step 3: Minimal implementation**

```<lang>
<actual code>
```

- [ ] **Step 4: Run it, verify it passes** — `<exact command>` → PASS (end of phase: the touched module's package)
- [ ] **Step 5: Generalization-audit pass** (after any bug fix / new pattern): population by mechanism → enumerate `<command>` → candidates → decision. Append to the log.
- [ ] **Step 6: Commit** — `git commit -m "<imperative subject> (#NN)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `<command>` → `<expected>`. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + sales close honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
