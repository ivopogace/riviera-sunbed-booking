# Riviera frontend overlay items

Repo-specific frontend bank items. Loaded by `riviera-review-overlay` and walked
**after** the generic frontend bank in `~/.claude/skills/review-question-banks/frontend.md`.

Item format: gate → follow-up → default severity → skill framing. Invariant numbers
reference `CLAUDE.md`.

## Always-run (when scope is FE or Full-stack)

### RV-FE-1. Angular standards
**Gate:** Does new Angular code follow the project standards?
- [ ] standalone components (no `NgModule` for new code)  [ ] `inject()` not constructor DI  [ ] `@if`/`@for`/`@switch` not `*ngIf`/`*ngFor`  [ ] `input()`/`output()` signal APIs not `@Input`/`@Output`  [ ] `NgOptimizedImage` for new `<img>` (venue photos especially)

**Follow-up:**
- Match the established style; document any deliberate deviation in the plan doc.
- Venue photos and beach imagery are image-heavy — use `NgOptimizedImage` and
  responsive sizing so the booking page stays fast on mobile.
- The authoritative, detailed Angular standards live in the in-repo
  `angular-developer` skill's `references/` (signals, forms, routing, testing,
  a11y). This bank checks the project-critical subset; defer to that skill for the
  full rules.

**Default severity:** Minor (consistency), Major if a non-standard pattern spreads.
**Skill framing:**
- Peer-review: "Each new component: standalone? `inject()`? new control flow? signal
  I/O?"

---

### RV-FE-2. Beach-map availability can go stale — handle the conflict (invariant #2)
**Gate:** Does the seat picker treat its availability snapshot as **stale-able** and
recover gracefully when a chosen set was taken meanwhile?
- [ ] map refetches availability for the selected date (not cached indefinitely)  [ ] booking submit handles a `409 SET_TAKEN` by refreshing the map and telling the user  [ ] optimistic "selected" state with no server reconciliation (violation)  [ ] taken sets visually distinct and not selectable

**Follow-up:**
- The server is the source of truth (invariant #2); the client map is a snapshot. A
  user can pick a set that someone else just took.
- On `409 SET_TAKEN`, don't dump a raw error — refresh availability, grey out the
  set, and prompt "that spot was just taken, pick another."
- Re-fetch availability when the user returns to the map or changes the date.

**Default severity:** Major for no conflict handling on submit; Minor for a missing
periodic refresh.
**Skill framing:**
- Peer-review: "What happens when the user books a set that got taken after the map
  loaded? Is there 409 handling that refreshes the map?"

---

### RV-FE-3. Money and dates rendered from the wire shape (invariants #5, #6)
**Gate:** Does the UI render money from minor units + currency, and dates as the
booking `LocalDate`, without doing money math in JS floats?
- [ ] amount formatted from integer minor units + currency code  [ ] price arithmetic done in JS with floats (violation)  [ ] booking date shown as a date (no implicit timezone shift)  [ ] total recomputed client-side and trusted (smell — server is authoritative)

**Follow-up:**
- Format minor units to a localized currency string at the view edge; don't add/scale
  prices in JS floating point.
- The displayed total is for confirmation; the **server** computes the charged
  amount.
- A booking date is a calendar day — render it without applying a timezone offset
  that could roll it to the previous/next day.

**Default severity:** Major for client-side float money math that drives the charge;
Minor for display-only rounding.
**Skill framing:**
- Peer-review: "Where does the UI compute or format price? Floats? Is the charged
  amount the server's or the client's?"

---

### RV-FE-4. Payment UI trusts Stripe Elements, not the client (invariant #8)
**Gate:** Does the checkout use Stripe's hosted/Elements flow with only the
**publishable** key, and never self-report success to confirm a booking?
- [ ] Stripe Elements / Checkout with publishable key only  [ ] any secret/restricted key in the frontend bundle (violation)  [ ] booking shown as confirmed purely from the client redirect, with no server/webhook confirmation (violation)  [ ] card data touched by app code instead of Stripe (violation — PCI)

**Follow-up:**
- Only the publishable key ships to the browser; secret keys stay server-side.
- The post-payment redirect updates UX optimistically but the **booking's confirmed
  state comes from the server** (driven by the verified webhook). Show a "finalizing"
  state and reconcile, rather than asserting paid from the redirect alone.
- Never collect raw card numbers in app inputs — that's Stripe Elements' job.

**Default severity:** **Blocker** for a secret key in the bundle or raw card handling;
Major for treating the redirect as proof of payment.
**Skill framing:**
- Peer-review: "Grep the bundle/config for secret keys. Does the confirmation screen
  trust the redirect or the server's booking state?"

---

### RV-FE-5. The visual seat picker is accessible
**Gate:** Is the beach-map seat picker usable beyond a pure pointer/visual
interaction?
- [ ] sets are keyboard-focusable and activatable  [ ] taken vs available conveyed by more than color alone  [ ] each selectable set has an accessible name (row/position, price, status)  [ ] map is a `<canvas>`/SVG with no semantic fallback (concern)

**Follow-up:**
- Front-row vs back-row, taken vs free, premium pricing — encode with text/aria, not
  color only.
- A keyboard and screen-reader user should be able to find and book a set.

**Default severity:** Minor→Major depending on how central the picker is to the flow
(it is the core flow, so lean Major for keyboard inaccessibility).
**Skill framing:**
- Peer-review: "Can the seat picker be operated by keyboard? Is status color-only?"
