# ADR-0013: Venue-photo moderation is report-and-remove, not pre-publication review

- **Status:** Accepted
- **Date:** 2026-08-03
- **Relates to:** ADR-0008 (venue photo storage — the single-transaction delete and the
  content-addressed serving URL this decision leans on), #230 (this decision's issue), #504 (the
  platform-admin takedown surface), #507 (the admin audit trail), invariant #13 (`/api/admin/**` is
  role-gated and exempt from per-venue ownership)

## Context

Venue photos shipped with **no moderation at all**: an operator's upload is tourist-visible
immediately. That rested on a premise — every operator is personally onboarded — which has since
weakened twice. Operator self-registration means operators are no longer personally onboarded;
what remains is the admin-approval gate, a human flipping every registration `PENDING`→`ACTIVE`.
And a `PENDING` operator now signs in, owns the venue it creates and can upload photos before any
human has looked at the account — approval gates **tourist visibility**, not console access. A
PENDING-owned venue is invisible and unbookable until approval, and its photos surface only
through those fenced venue reads, so no unvetted upload reaches a tourist ahead of the same admin
decision as before. The human gate stands; it has moved from "before the upload can exist" to
"before tourists can see it".

Scale is the deciding constraint. At Phase 1 this is a handful of Albanian-riviera venues, each
behind an approved operator account, uploading marketing photographs of their own beach — the
incentive to upload something harmful is close to zero, because the photo *is* the venue's sales
pitch. The cost of guessing wrong is bounded and reversible: one takedown call.

## Decision

**Trusted operators, report-and-remove.** Venue photos publish immediately on upload; there is no
pre-publication review, no `moderation_state`, and no automated screening. Removal is reactive, by
platform admin, through the takedown surface. The posture rests on three things:

- **Account-level vetting, not content-level.** A human approves every operator before tourists
  can see anything it uploads. The trust boundary is the *account*, and that is the whole basis
  for skipping content review — if approval ever stops being a meaningful check, this ADR's
  premise fails and the decision must be revisited (see Consequences).
- **An operable removal path.** The admin takedown (`DELETE /api/admin/venues/{venueId}/photos/{slot}`)
  reaches any venue, is role-gated on `is_admin`, and drives ADR-0008's single cascading `DELETE`,
  so metadata and every variant go together. The admin console's Photos tab makes it a two-click
  action. The owning operator's own delete/replace is unchanged and remains the ordinary path.
- **Out-of-band reporting.** There is deliberately **no** tourist-facing "report this photo" UI. A
  report arrives by email or by an operator/staff member noticing. Building a report button before
  there is any report volume would be inventing a queue nobody feeds.

**What this decision explicitly rejects building now:** an approval queue, a `moderation_state`
column, any pre-publication gating, a vision-API screening call at upload, and a reporting UI.

## Consequences

- **A bad photo is visible until someone acts.** That is the accepted cost, and the honest
  characterization of this posture — not "photos are moderated". The exposure window is
  report-latency plus admin-response time, both unbounded and unmonitored at Phase 1.
- **Every takedown leaves an audit record.** "Reactive removal by a trusted admin" is only a
  defensible posture if the removal is attributable, and report-and-remove without accountability
  is just remove. Every mutating `/api/admin/**` action past the security gate writes an
  `admin_audit_record` row (actor, action, outcome, UTC instant, optional `X-Audit-Reason` grounds
  collected by the takedown confirmation), readable in the admin console's Audit tab. The
  mechanism is platform-wide, not photo-specific.
- **A takedown reaches shared caches and `ETag` holders.** The serving GET returns
  `Cache-Control: public, no-cache` and gates its `304` on the variant still existing (ADR-0008),
  because `*.onrender.com` is Cloudflare-fronted on Render's own zone, which we cannot purge, and a
  `304` answered from the URL path alone would let a removed photo revalidate forever. A purge
  step is the right answer for a future self-owned CDN and is a precondition on ADR-0008's
  object-storage flip.
- **Takedown is scoped to one slot, not one image.** The variant pipeline is deterministic, so the
  same picture uploaded into two slots shares a `(venue, content_hash)` and the serving read takes
  either. A moderator removing an offending image must remove it from *each* slot that carries it.
- **The decision is cheap to reverse in one direction and not the other.** Adding an approval
  queue later is additive: a `moderation_state` column plus one `WHERE` clause per read model, on
  seams that already exist (`PhotoStorage`, the blob-free cover reads in `JdbcVenueCatalog`). What
  it does not do is retroactively review the photos published in the meantime.
- **This ADR's premise is falsifiable, and should be re-checked, not assumed.** It fails if admin
  approval stops being meaningful vetting — registration volume making per-operator review
  shallow, or approval becoming a rubber stamp. #230's trigger conditions are the test.

## Alternatives considered

- **Approval queue (photo lands `PENDING`, admin approves → tourist-visible).** Rejected for
  Phase 1 as the wrong shape at this scale: it puts a human in the path of *every* upload to
  prevent a harm that has not occurred once, and the queue's latency lands on the venue's own
  sales photograph. It is also the alternative most likely to be right *later* — a scale judgment,
  not a principled objection, and the seams to add it are deliberately left intact.
- **Automated screening (vision-API check at upload).** Rejected: an external dependency and a
  per-upload cost on the money-path-adjacent write, buying probabilistic coverage of a risk that is
  currently near zero, and still needing a human appeal path on false positives. Revisit if upload
  volume ever makes manual response impractical.
- **Do nothing.** Rejected because it is not neutral: the takedown lever already existed with no
  written policy governing when to pull it. Writing the stance down is what makes that lever
  accountable rather than merely available.

## Amendment log

- #507 / #511 — the audit-record requirement, first accepted as a tracked deficiency, was closed
  by the platform-wide admin audit trail once the console made takedown a two-click action.
- #508 — the serving cache directive changed to `public, no-cache` with an existence-checked
  `304`; two premises (no CDN in front of the API; exposure bounded to clients already holding
  the bytes) were wrong.
- 2026-08-17, #694 — the human gate moved from console access to tourist visibility.
