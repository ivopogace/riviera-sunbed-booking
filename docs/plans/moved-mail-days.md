# Multi-day stays: the remodel-moved mail names a stay's days Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** When a remodel moves a booking that spans several days, the "your spot changed" mail
names every day (`Days:          3 July – 7 July 2027 (5 days)`); a one-day booking's mail reads
exactly as before.

**Architecture:** `BookingMoved` gains a nullable `lastDate`, the shape `BookingConfirmed` and
`BookingCancelled` took: a payload serialized before the field reads as one day through
`lastDay()`. `RemodelClaimsService` publishes it off the moved claim's span, and the moved-mail
listener takes the days off the event (as the confirmation and cancellation listeners do) while
the spots, distance and deadline keep coming from the receipt's move facts. `SmtpMailer` renders
the line through its existing `daysLine`.

**Persistence:** JDBC only (invariant #1). No table or migration touched; no new query.

**Source of intent:** GitHub issue #1215 (epic #1096); `docs/architecture/multi-day-stays.md`.

**Skills consulted:** `riviera-sdlc` (intake gate: the issue says the mail prints off
`BookingMoved.bookingDate`, but the listener reads the day from `BookingNotificationFacts.moveFacts`
— the listener changes too; open PRs are all dependabot's; no Flyway; previous sibling #1202's
plan is `DONE — merged via PR #1216` and retires at this close-out) · `riviera-plan-doc` (forced
the old-payload read into the risk register and the listener's source of the days into an AC) ·
`tdd` (each AC red first at its seam: the service's event publisher, the listener's mail port, the
SMTP transport) · `riviera-review-overlay` (at ready-for-review) · `riviera-docs-freshness` (at
close-out) · `riviera-java-conventions` (a one-day convenience constructor per record, as the
siblings; Javadoc re-read whole on each touched record) · `riviera-modulith` (an added field on a
published event record is not a move or rename, so no `event_type` rewrite; id-based payload
kept, #11) · `riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped test runs only)

**Branch:** `claude/sdlc-1215-7n6dby` (the designated cloud branch stands in for
`feature/moved-mail-days`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a live `CONFIRMED` stay from D to D+2 on a disturbed set with a free
  candidate, when the remodel commits, then every day is claimed on the candidate and released on
  the old set, and `BookingMoved` is published with `bookingDate` D and `lastDate` D+2. *Seam:*
  `RemodelClaims.commit` → `ApplicationEventPublisher` · *Pinned by:*
  `RemodelClaimsServiceTest.commitMovesAStayEveryDayAndPublishesItsLastDay`
- [ ] **AC-2:** Given a `BookingMoved` for a stay D..D+2, when the listener runs, then the mail
  it hands `TransactionalMailService` carries `bookingDate` D and `lastDate` D+2; a `BookingMoved`
  whose `lastDate` is `null` (an old payload) carries `lastDate` = D. *Seam:*
  `TransactionalMailService.sendBookingMoved` · *Pinned by:*
  `BookingMovedMailListenerTest.aMovedStayMailsItsDays`,
  `BookingMovedMailListenerTest.aPayloadWithoutALastDateMailsOneDay`
- [ ] **AC-3:** Given a moved-stay mail 15–17 August 2026, when `SmtpMailer` sends it, then the
  body reads `Days:          15 August – 17 August 2026 (3 days)`, says the days are unchanged, and
  has no `Date:` line; a one-day moved mail keeps `Date:          15 August 2026`. *Seam:* the
  `Mailer` port over SMTP (GreenMail) · *Pinned by:*
  `SmtpMailerIT.aMovedStayNamesItsDays`, `SmtpMailerIT.aMovedOneDayBookingKeepsItsDateLine`
- [ ] **AC-4:** Given a stay D..D+2 seeded with a receipt move and `moved_at`, when its
  `BookingMoved` is published through the registry, then the mail in the mock outbox carries the
  stay's last day. *Seam:* the event publication registry → `MockMailer` · *Pinned by:*
  `BookingMovedMailIT.aMovedStayIsMailedWithItsDays`

## Non-goals

- The payment-due, declined and expired mails (Request-to-Book stays arrive with #1203, which owes
  them the same line).
- The free-exit deadline for a stay: still derived from the first day, unchanged.
- A span-aware move candidate (#1217).
- The mock outbox JSON (`/api/mock-mail/booking-mails`): it carries no last day for the
  confirmation or cancellation mails either.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An incomplete `BookingMoved` publication serialized before the field existed deserializes with `lastDate` null and the mail breaks | Low | Med | `lastDay()` reads null as one day; pinned by AC-2's old-payload case | implementer | open |
| R-2 | The listener's first day comes from the event while it used to come from the receipt: the two could disagree | Low | Low | Both are the moved claim's `bookingDate`, written in the same transaction; AC-4 seeds the receipt and the event from one date | implementer | open |
| R-3 | Boundary leak (#11) or code in the event (#7) | Low | High | The added field is a `LocalDate`; the payload stays ids + dates | implementer | open |

## Open questions / Assumptions

- **Assumption:** the mail's copy for a stay reads "Your booking code, price and days are
  unchanged." (the one-day copy keeps "date") — *Owner:* implementer · *Resolves by:* review.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the move's claim-every-day-then-release path is unchanged
(slice 1); this slice only adds the span's last day to the event it already publishes. AC-1
re-pins the per-day claim and release for a stay because no existing test moves one.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | none new | publishes `BookingMoved` from the remodel commit |
| M-2 | `notification` | existing | none | renders and sends the moved mail |

**Cross-module `api/` ports**

N/A — no port added or changed.

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `BookingMoved` (+ `lastDate`) | `booking` (`RemodelClaimsService`) | booking, venue, from set, to set ids; first and last service day | `notification` | async after commit | AC-1, AC-2, AC-4 |

### Module ownership (§4a)

Single capability per module, no boundary change: `booking` states the moved booking's span
(its Job: bookings and their lifecycle), `notification` renders the mail (its Job: transactional
mail).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `plan`

**Next action:** phase 0 — AC-1 red.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the event carries the stay's last day | | |
| 1 — the moved mail names the days | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/events/BookingMoved.java` — `lastDate` + `lastDay()` + the one-day constructor
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — publishes the span's last day
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingMovedMail.java` — `lastDate` + the one-day constructor
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingMovedMailListener.java` — the days off the event
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — the days line in the moved mail
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingMovedMailListenerTest.java` — AC-2
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SmtpMailerIT.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/notification/BookingMovedMailIT.java` — AC-4
- `platform/src/test/java/ai/riviera/platform/notification/BookingMailFixtures.java` — a stay's move fact
- `docs/plans/range-booking.md` — retired at close-out (merged via PR #1216)

---

## Phase 0 — the event carries the stay's last day

**Files:** Modify `BookingMoved.java`, `RemodelClaimsService.java` · Test `RemodelClaimsServiceTest.java`

- [ ] **Step 1:** AC-1 test — a stay `LiveClaim` D..D+2, a candidate free on D; verify three claims,
  three releases and `new BookingMoved(..., D, D+2)`.
- [ ] **Step 2:** Red — `./gradlew --console=plain test --tests "*RemodelClaimsServiceTest*"` →
  compile failure (no six-arg `BookingMoved`).
- [ ] **Step 3:** `BookingMoved` gains `lastDate`, `lastDay()` and a one-day constructor; the service
  publishes `claim.lastDate()`.
- [ ] **Step 4:** Green — same command; then the structural net.
- [ ] **Step 6:** Commit `Multi-day stays: BookingMoved carries the stay's last day (#1215)`.

## Phase 1 — the moved mail names the days

**Files:** Modify `BookingMovedMail.java`, `BookingMovedMailListener.java`, `SmtpMailer.java`,
`BookingMailFixtures.java` · Test `BookingMovedMailListenerTest.java`, `SmtpMailerIT.java`,
`BookingMovedMailIT.java`

- [ ] **Step 1:** AC-2 and AC-3 tests; AC-4 IT.
- [ ] **Step 2:** Red — `./gradlew --console=plain test --tests "*BookingMovedMailListenerTest*"
  --tests "*SmtpMailerIT*"` → compile failure / body lacks `Days:`.
- [ ] **Step 3:** `BookingMovedMail` gains `lastDate`; the listener passes `event.bookingDate()`,
  `event.lastDay()`; `SmtpMailer#sendBookingMoved` renders `daysLine(..., MOVED_LABEL_WIDTH)` and
  "date"/"days" in the unchanged-sentence.
- [ ] **Step 4:** Green — same command plus `--tests "*BookingMovedMailIT*"` (Docker).
- [ ] **Step 6:** Commit `Multi-day stays: the moved mail names a stay's days (#1215)`.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*RemodelClaimsServiceTest*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*BookingMovedMailListenerTest*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "*SmtpMailerIT*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*BookingMovedMailIT*"` → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A.
- [ ] Modulith section filled; id-based payloads (#11); no code in the event (#7).
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
