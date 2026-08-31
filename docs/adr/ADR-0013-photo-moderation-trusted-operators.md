# ADR-0013: Venue-photo moderation is report-and-remove, not pre-publication review

- **Status:** Accepted (the posture was chosen by the maintainer in #230, who directed this stance be
  written up and ratified it at merge; the "remove" half shipped ahead of it in #504/PR #506)
- **Date:** 2026-08-03
- **Relates to:** ADR-0008 (venue photo storage — the single-transaction delete and the immutable
  content-addressed serving URL this decision leans on), #142 (venue photos end-to-end, which shipped
  with moderation explicitly out of scope), #230 (this decision's issue), #504 (the platform-admin
  takedown surface), #115 (operator self-registration + admin approval — the vetting gate this rests
  on), **#507** (the admin audit trail this decision requires), **#508** (the CDN purge this decision
  will require), invariant #13 (`/api/admin/**` is role-gated and exempt from per-venue ownership)

## Context

#142 shipped venue photos with **no moderation at all**: an operator's upload is tourist-visible
immediately. That was a deliberate 2026-07-11 grill decision resting on a premise — every operator
is personally onboarded — and #230 exists so the decision stays visible rather than becoming an
accident.

Two things have moved since:

1. **The premise weakened.** Operator self-registration shipped (#115, V29), so operators are no
   longer personally onboarded. What remains is the admin-approval gate: a human still flips every
   registration `PENDING`→`ACTIVE` before that account can own a venue or upload anything. Vetting
   is shallower than it was, but it is not gone, and it is still a *human* gate on the account
   rather than on the content.
2. **The "remove" half got built** (#504). `DELETE /api/admin/venues/{venueId}/photos/{slot}` lets
   a platform admin remove any venue's photo regardless of ownership. Before it, removing a
   reported photo meant asking the operator or hand-running SQL — i.e. report-and-remove was the
   implied posture but was not actually operable.

So the choice #230 poses is live and has to be made explicitly: what protects tourists from a bad
venue photo, and what is deliberately *not* built.

Scale is the deciding constraint. At Phase 1 this is a handful of Albanian-riviera venues, each
behind an approved operator account, uploading marketing photographs of their own beach — the
incentive to upload something harmful is close to zero, because the photo *is* the venue's sales
pitch. The cost of guessing wrong is bounded and reversible: one takedown call.

## Decision

**Trusted operators, report-and-remove.** Venue photos publish immediately on upload; there is no
pre-publication review, no `moderation_state`, and no automated screening. Removal is reactive, by
platform admin, through the #504 takedown surface.

The posture rests on three things that already exist:

- **Account-level vetting, not content-level.** A human approves every operator before it can
  upload (#115). The trust boundary is the *account*, and that is the whole basis for skipping
  content review — if approval ever stops being a meaningful check, this ADR's premise fails and
  the decision must be revisited (see Consequences).
- **An operable removal path.** #504's admin takedown reaches any venue, is role-gated on
  `is_admin`, and drives ADR-0008's single cascading `DELETE`, so metadata and every variant go
  together. The owning operator's own delete/replace is unchanged and remains the ordinary path.
- **Out-of-band reporting.** There is deliberately **no** tourist-facing "report this photo" UI at
  Phase 1. A report arrives by email or by an operator/staff member noticing. Building a report
  button before there is any report volume would be inventing a queue nobody feeds.

**What this decision explicitly rejects building now:** an approval queue, a `moderation_state`
column, any pre-publication gating, a vision-API screening call at upload, and a reporting UI.

## Consequences

- **A bad photo is visible until someone acts.** That is the accepted cost, and it is the honest
  characterization of this posture — not "photos are moderated." The exposure window is
  report-latency plus admin-response time, both unbounded and unmonitored at Phase 1.
- **~~A takedown must leave an audit record — required, not yet built (#507)~~ — CLOSED by #507
  (PR #516):** every mutating `/api/admin/**` action past the security gate now writes an
  `admin_audit_record` row (actor, action, outcome, UTC instant, optional `X-Audit-Reason`
  grounds collected by the takedown confirmation), readable in the admin console's Audit tab.
  The original consequence, kept for the record: this ADR *decided*
  the question rather than parking it, because the requirement is load-bearing for the stance and
  not an adjacent nicety: "reactive removal by a trusted admin" is only a defensible posture if the
  removal is attributable. An irreversible action with no record of who acted, when, or on what
  grounds is not accountable, and report-and-remove without accountability is just remove.
  The mechanism is deliberately **not** photo-specific: no admin surface in this repo logs today
  (`AdminErasureController`, `AdminOperatorController`, `AdminMailOutboxController` are all silent),
  so a log added to the takedown alone would be a lone precedent rather than a policy — hence #507,
  platform-wide, at `needs-triage`. **Consequence to state plainly: this stance ships with a known,
  tracked deficiency.** The takedown is live and unattributable until #507 lands. That is an accepted
  Phase-1 risk (takedowns are expected to be rare-to-never at current scale), not an oversight, and
  it is the first thing to fix if takedowns stop being hypothetical. *(The "no admin surface logs"
  sentence above describes the pre-#507 world; it is what #507's blanket edge filter fixed.)*

  > **Amended by #511 — that trigger condition is now met, and this is stated rather than left
  > implicit.** The acceptance above leaned on real friction: #504's only interface was a
  > hand-crafted authenticated `curl DELETE`, which kept an unattributable destructive action rare
  > by making it awkward. #511 deliberately removes that friction — a Photos tab in the admin
  > console turns takedown into a two-click action from a phone, which is the whole point of the
  > slice. The *frequency* assumption the risk acceptance rested on therefore no longer holds, so
  > **#507 (the platform-wide admin audit trail) should be re-triaged off `needs-triage`**: it is no
  > longer "the first thing to fix *if* takedowns stop being hypothetical" but the first thing to
  > fix, full stop. Nothing else in this stance changes; the deficiency was always tracked, and what
  > #511 changes is its priority, not its nature.
- **~~A takedown does not un-cache an already-served image~~ — CLOSED by #508.** This was recorded
  as the single most likely way this decision stops working without anyone noticing, on the
  reasoning that ADR-0008's `Cache-Control: public, max-age=31536000, immutable` is sound for a
  *replace* (which mints a new hash → a new URL) but not for a takedown, which mints nothing.

  Two of the premises stated here turned out to be **wrong**, which is why it was fixed rather than
  left pending a CDN:
  - *"There is no CDN in front of the API."* `*.onrender.com` is **Cloudflare-fronted** — measured
    in #286, and `ClientIpResolver` plus `docs/deploy/cd-pipeline.md` already depended on that fact.
    A shared cache was in front of the serving GET the whole time. It is **Render's** zone, so
    purge-on-takedown — one of the "two acceptable answers" — was never available for it; the origin
    header is the only lever over that edge.
  - *"The exposure is bounded to clients already holding the bytes."* It was worse: the `304`
    short-circuit was answered from the URL path alone, so **any** client holding the `ETag` kept
    revalidating a deleted photo successfully, indefinitely, independently of any CDN.

  Both are closed: the serving GET now returns `Cache-Control: public, no-cache` and gates its
  `304` on the variant still existing (ADR-0008's #508 amendment). A takedown therefore reaches
  shared caches and `ETag` holders alike. The purge step remains the right answer for a **future
  self-owned** CDN and is recorded as a precondition on ADR-0008's object-storage flip.
- **Takedown is scoped to one slot, not one image.** The variant pipeline is deterministic, so the
  same picture uploaded into two slots shares a `(venue, content_hash)` and the serving read takes
  either. Removing one slot leaves the bytes reachable while another slot still publishes them.
  Correct — the surviving slot is still a published photo — but a moderator removing an offending
  image must remove it from *each* slot that carries it.
- **The decision is cheap to reverse in one direction and not the other.** Adding an approval queue
  later is additive: a `moderation_state` column (V38+) plus one `WHERE` clause per read model, on
  seams that already exist (`PhotoStorage`, the blob-free cover reads in `JdbcVenueCatalog`).
  Nothing here forecloses it. What it does not do is retroactively review the photos published in
  the meantime.
- **This ADR's premise is falsifiable, and should be re-checked, not assumed.** It fails if
  admin approval stops being meaningful vetting — registration volume making per-operator review
  shallow, or approval becoming a rubber stamp. #230's own trigger conditions are the right test.

## Alternatives considered

- **Approval queue (photo lands `PENDING`, admin approves → tourist-visible).** Rejected for Phase 1
  as the wrong shape at this scale: it puts a human in the path of *every* upload to prevent a harm
  that has not occurred once, and the queue's latency lands on the venue's own sales photograph. It
  is also the alternative most likely to be right *later* — this is a scale judgment, not a
  principled objection, and the seams to add it are deliberately left intact.
- **Automated screening (vision-API check at upload).** Rejected: it adds an external dependency and
  a per-upload cost on the money-path-adjacent write, buys probabilistic coverage of a risk that is
  currently near zero, and still needs a human appeal path when it false-positives on a legitimate
  beach photo. Revisit if upload volume ever makes manual response impractical.
- **Do nothing / leave #230 open.** Rejected because it is not actually neutral. #504 already built
  the remove half, so the platform now has a takedown lever with no written policy governing when to
  pull it — an admin can delete any venue's photo and nothing states the grounds. Writing the stance
  down is what makes that lever accountable rather than merely available.

## Amendment (2026-08-17, #694)

Premise 1 weakened again: a `PENDING` operator now signs in, owns the venue it creates, and can
upload photos **before** any human has looked at the account — approval gates tourist visibility,
not console access. The human gate this ADR leans on still stands, but it has moved: from "before
the upload can exist" to "before tourists can see it". A PENDING-owned venue is invisible and
unbookable until approval (the #693 fence), and its photos surface only through those fenced venue
reads, so no unvetted upload reaches a tourist ahead of the same admin decision as before. The
report-and-remove posture and the #504 takedown lever are unchanged; #230's re-check triggers apply
to this shape of the gate exactly as they did to the old one.
