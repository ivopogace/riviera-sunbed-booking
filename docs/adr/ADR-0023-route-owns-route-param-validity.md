# ADR-0023: The route owns a route param's validity — components never carry a not-found arm for it

- **Status:** Accepted
- **Date:** 2026-09-16
- **Relates to:** issue #1127 (which asked for this decision) and #1128 (the copy defect it
  dissolves). Supersedes the per-component pattern three merged slices built — #1124 (the
  announcers), #1126 (the layout editor and pricing tab), and the original #170 review finding
  that put the first arm in the console shell. Surfaces:
  `.claude/skills/riviera-frontend/SKILL.md` § *Routing*.

## Context

The venue console is a layout component at `/operator/:venueId` with a child route per tab. Both
the shell and every tab derive the venue from that one segment through the same rule
(`shared/parent-venue-id.ts`'s `idParam`: a positive integer, else `undefined`).

Each of them also **answered** the `undefined` case. The shell gated its `<router-outlet>` behind
`@if (venueId() === undefined)` and rendered a "Venue not found" card; `venue-tab`, `pricing-tab`
and `layout-editor` each rendered their own invalid-link card; `requests-tab`, `payouts-tab` and
`daily-view-tab` each reused their load-error state for it. Seven answers to one question.

Six of the seven could never be displayed. A tab reads the param off `route.parent` — the shell's
own `ActivatedRoute` — so a tab's `venueId()` is `undefined` exactly when the shell's is, and the
shell had already removed the outlet by then. The tabs reached the state only in unit specs that
constructed them directly. #1126 spent ~500 lines of template re-indentation and six specs on one
such branch, and recorded that no Playwright spec in either suite could drive any of them.

The seventh — the shell's own card — was reachable, and its copy disagreed with the tabs': it
offered to *create a venue* while they pointed at the *venue list*. Nobody saw the disagreement,
because nobody could see the tabs' arm.

So the pattern cost real maintenance for a guarantee it did not provide, and its one visible
surface was untestable end to end. #1127 put two options: keep the arms as defence-in-depth and
align their copy, or retire them and let the shell own the surface alone. Both leave "is this
segment a venue?" a question every component downstream must be able to answer.

## Decision

1. **A route param's validity is decided by the route, before anything under it activates.**
   `core/venue-id.guard.ts` applies `idParam`'s rule on `/operator/:venueId` and returns a
   `UrlTree` to `/operator/venue-not-found` when it fails. Guards live in `core/` and are applied
   in `app.routes.ts`, as they already were.
2. **One page owns the invalid-link surface**, `operator/venue-not-found.ts`, carrying the shell
   card's markup, utilities and test ids unchanged — and offering **both** destinations the two
   copies disagreed about, the venue list and create-a-venue, rather than picking a side. Being a
   route, it is reachable by a navigation, so the mocked Playwright suite drives it.
3. **The gate's rule is canonical, not `Number()`'s.** `idParam` demanded only
   `Number.isInteger(…) && > 0`, which accepts `7e2` as 700, `0x10` as 16, and `+7` / `7.0` /
   `007` / `' 7 '` as 7 — each aliasing a venue under a URL that does not spell it. It now
   requires a canonical decimal positive integer inside the safe-integer range. The rule is shared,
   so the tourist map's `:id` is fixed by the same change.
4. **Downstream signals are required, and throw.** `venueIdParam` / `parentVenueId` return
   `Signal<number>`. A console component that reads no valid id is a routing bug, not a user state,
   so it fails loudly instead of returning `undefined` for a branch no operator can reach. The
   generic `routeIdParam` stays optional, for a route with no gate.
5. **No console template carries an invalid-id arm.** All seven are deleted, with the
   `venueId === undefined` early returns behind them.
6. **The guard runs before the session guard.** A malformed segment is malformed whoever is
   asking, so a signed-out visitor signs in *for the page* rather than for a link that can never
   work.
7. **The literal route sits above `operator/:venueId`.** `venue-not-found` is itself a legal
   `:venueId` segment: matched by the param route, the guard would redirect its own destination
   forever. `venue-id.guard.spec.ts` drives the real route table and pins this.

## Considered options

- **Keep the arms as defence-in-depth, align their copy** (#1127's option 1). Cheapest in lines
  and it preserves each tab's stated contract. Rejected: it keeps seven answers to one question
  and six branches no test outside a unit spec can reach, and it pays that cost for a guarantee
  that only materialises if someone deletes a gate that has its own locking test.
- **Retire the arms, let the shell own the surface** (#1127's option 2). Removes the dead
  branches. Rejected as stated: the tabs' `venueId()` would still be `number | undefined`, and
  roughly twenty logic guards depend on that, so deleting only the *display* half leaves each tab
  rendering a never-resolving skeleton in a state it can no longer describe. A dead branch you can
  see is better than one you cannot. Narrowing the contract to make it sound is most of the work
  this ADR does anyway — but without a route gate there is nothing to make the narrowing true.
- **`canMatch` returning `false` instead of `canActivate` returning a `UrlTree`.** Runs earlier
  (before the lazy chunk resolves), and is the mechanism Angular's `CanMatch` docs present.
  Rejected: a false `canMatch` *skips* the route, so the URL must be caught by another config —
  either an app-wide `**` catch-all, which does not exist and whose shape is a separate product
  decision (what a tourist 404 looks like), or a sibling route with a segment-consuming
  `UrlMatcher` to swallow `/operator/<bad>/<tab>`. `canActivate` + `UrlTree` is the in-tree
  precedent (`core/operator-session.guard.ts`) and needs neither.
- **Redirect to `/operator` (the venue list) with no page.** The smallest diff: no new component,
  no new route. Rejected: it silently drops the one *reachable* invalid-venue surface, and the
  operator learns nothing about why they were bounced.
- **A `canMatch` guard on the tourist `venues/:id` too.** Rejected for now: that route has a
  single owner and no duplicated arm to retire, so the gate would buy nothing there. It still gets
  the canonical-id fix, which is where the real defect was.

## Consequences

- **The invalid-venue surface is testable end to end for the first time.** `frontend/e2e/
  venue-id-route-gate.e2e.ts` navigates to `/operator/not-a-venue` and `/operator/0/pricing` in a
  real browser and runs axe on the result. The existing `fixed-ink-token-recut.e2e.ts`, which
  already drove `/operator/not-a-venue` for the card's hairline token, keeps passing unchanged —
  the card is the same card at a different URL.
- **A new id-carrying route inherits an obligation.** Gate it, or document why the component
  answers for itself (the tourist map's shape). Do not add an eighth per-component arm.
- **`/operator/<malformed>` now changes the URL.** The address bar reads
  `/operator/venue-not-found`, not what was typed, so the page's copy cannot tell the operator to
  "check the address" against it — it names the two places to go instead.
- **A valid-but-unknown id is unchanged.** `/operator/999` where the backend does not know 999
  still mounts the console and shows each tab's load-error state. The guard judges the URL, not the
  database.
- **A non-canonical id that used to work now does not.** `/operator/0x10` opened venue 16 and
  `/operator/7e2` opened venue 700; both are now the not-found page. No in-app link ever produced
  such a URL, and a bookmark holding one was already showing a venue its address did not name.
- **Losing a branch means losing its trigger, not its behaviour.** Dropping venue-scoped state and
  emptying a live region without unmounting it is what a venue *switch* does; six specs that drove
  it through a malformed param now drive it through a valid one.
