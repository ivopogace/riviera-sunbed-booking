# ADR-0013: Venue-photo moderation is report-and-remove, not pre-publication review

- **Status:** Proposed (decided by #230; the "remove" half shipped ahead of it in #504/PR #506)
- **Date:** 2026-08-03
- **Relates to:** ADR-0008 (venue photo storage — the single-transaction delete and the immutable
  content-addressed serving URL this decision leans on), #142 (venue photos end-to-end, which shipped
  with moderation explicitly out of scope), #230 (this decision's issue), #504 (the platform-admin
  takedown surface), #115 (operator self-registration + admin approval — the vetting gate this rests
  on), invariant #13 (`/api/admin/**` is role-gated and exempt from per-venue ownership)

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
- **No audit record of a takedown.** #504 ships none, deliberately: no admin surface in this repo
  logs its action today (`AdminErasureController`, `AdminOperatorController`,
  `AdminMailOutboxController` are all silent), so adding one there would have been a lone precedent
  rather than a policy. This ADR does not settle it either — it is recorded as an open consequence.
  A destructive, irreversible action with no record of who did it or why is a real gap the moment
  takedowns stop being hypothetical, and the first genuine dispute ("who removed my cover photo?")
  is the trigger to build it.
- **A takedown does not un-cache an already-served image.** ADR-0008's serving GET returns
  `Cache-Control: public, max-age=31536000, immutable` — sound for a *replace*, which mints a new
  hash and therefore a new URL, but a takedown mints nothing. Today the exposure is bounded: the
  tourist read models stop advertising the URL, so a new requester gets `404`, and there is no CDN
  in front of the API (the backend serves the SPA same-origin, #110). **The day ADR-0008's deferred
  object-storage + CDN lands, this becomes a real hole** — a year-long `immutable` TTL would keep a
  taken-down image served to *new* requesters until someone purges it, defeating the removal. Whoever
  implements that migration must pair it with an explicit purge step, or reconsider `immutable` for
  this route. This is the single most likely way this decision silently stops working.
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
