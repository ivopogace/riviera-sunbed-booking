# Riviera Sunbed Booking — Design Spec

**Date:** 2026-06-25
**Status:** Draft for review
**Author:** Ivo Pogace (with Claude)

---

## 1. Problem & Opportunity

During summer on the Albanian south riviera, beach clubs, bars, hotels, and
restaurants own the sunbeds on their stretch of beach. Most have no way for
visitors to reserve a sunbed online ahead of time. Tourists frequently arrive to
find every sunbed already taken, ruining a planned beach day.

This product lets tourists **reserve a specific sunbed set, on a specific
beach, for a specific day, and pay in advance** — removing the "we drove here and
everything's full" failure. Venues get a simple tool to publish availability and
sell sunbeds online. The platform earns a **commission per booking**.

It is a **two-sided marketplace** (tourists = demand, venues = supply) with a
strong seasonal peak (summer) and a geographically concentrated launch.

---

## 2. Strategy & Scope

- **Customer priority:** Tourist-first. Build a great booking experience to pull
  demand; venues are the supply side that grows as demand appears.
- **Phase 1 launch area:** **Palasë, Drymades, Dhërmi** — the organized
  beach-club stretch where sets are well-defined, prices are higher, and guests
  already expect to pay for a good spot. Best fit for the premium model.
- **Phase 2 expansion:** **Ksamil, Sarandë**, then outward along the riviera.
- **Launch supply target:** A dense **5–15 venues** in the Phase 1 area rather
  than a thin scatter. Density builds tourist trust and local word of mouth, and
  is the only way to beat the chicken-and-egg problem.

---

## 3. Core Product Decisions (locked)

| Decision | Choice |
|---|---|
| Primary customer at launch | Tourists |
| Bookable unit | A **set** = 2 loungers + 1 umbrella |
| Booking duration | **Full day** |
| Spot granularity | **Exact spot**, chosen from a visual beach map |
| Booking modes | **Instant Book** and **Request-to-Book** (venue chooses per venue) |
| Payment | **Pay in-app**, platform takes a **commission per booking** |
| Platform (launch) | **Mobile-friendly web app**; native apps later if it grows |
| Cancellation policy | Tiered (see §6) |
| Booking lead time | **No same-day booking at launch** — bookings close the evening before |

---

## 4. Core User Journeys

### 4.1 Tourist
1. Open the web app (phone or laptop) → pick a **beach/area and a date**.
2. See venues on that beach with photos, price per set, rating, and that day's
   availability.
3. Open a venue → see the **visual beach map**: available sets green, taken sets
   grey, premium/front-row sets priced higher.
4. Tap the desired set(s) → see total price and the cancellation terms.
5. Pay in-app (card / Apple Pay / Google Pay) → receive a **confirmation with a
   booking code** plus an email.
6. On arrival, staff verify the booking code.
7. Can view and cancel bookings; refunds follow the tiered policy (§6).

Account is intentionally light — guest checkout with an email is acceptable.

### 4.2 Venue
1. **Onboard once:** create venue profile, upload photos, set price(s), and lay
   out the beach map (rows + individual set positions, mark premium/front-row).
2. **Daily operation:** the map is the **single source of truth**. When a walk-in
   takes a set, staff tap it to mark it taken (it disappears online instantly);
   when an online booking arrives, that set greys out for staff too.
3. **Mode:** choose **Instant Book** (auto-confirm against live map) or
   **Request-to-Book** (booking arrives as a request to accept/decline).
4. **Daily view:** today's bookings + booking codes; payout owed (booking price
   minus commission).

The **shared, real-time map** that both online bookings and staff taps write to
is the heart of the operational design (see §7).

---

## 5. Payment Architecture (locked)

Stripe **does not operate in Albania**, so an Albania-registered business cannot
use it. The founder lives in **Germany** (Stripe-supported) and holds both a
**German bank account** and an **Albanian BKT account**. This yields a clean
model:

- **Register the company in Germany.**
- **Collect** all booking payments via **Stripe** (cards, Apple Pay, Google Pay,
  SEPA) into the German business account.
- **Pay out to venues manually in weekly batches:** move the venues' share to the
  **BKT account** and pay each Albanian venue by **domestic transfer**, minus
  commission. Cheap, fast, no per-venue FX.

We deliberately **do not** use Stripe Connect auto-split (its payouts can't reach
Albanian venue accounts). The app integrates a **single payment gateway behind a
clean interface** and performs venue payouts itself, so the architecture is
gateway-agnostic and unchanged by this decision.

**Open business item (not an app concern):** confirm the cleanest legal structure
with a Steuerberater — e.g. *Kleinunternehmer* to start vs a *UG* for limited
liability — and the "platform collects on the venue's behalf" framing, since the
platform acts as a payment intermediary.

---

## 6. Cancellation, No-Show & Weather Policy (locked)

- **Free cancellation until a cutoff** (e.g. **6pm the evening before**) → full
  refund.
- **After the cutoff** → non-refundable (or partial), since the venue has lost the
  chance to resell the set.
- **Weather exception** → official bad-weather forecast/closure → full refund
  regardless of timing.

This cutoff also doubles as the booking lead-time cutoff (§7, Layer 2), so the two
policies reinforce each other.

---

## 7. Preventing the Walk-in vs Online Collision

The central operational risk: a walk-in physically occupies a set before staff
mark it taken, while a tourist books it online — a double claim. Software alone
cannot fully prevent this (physical reality and the database are never perfectly
synced), so the design attacks it in layers:

- **Layer 1 — Separate pools.** Each venue splits sets into an
  **online-bookable pool** (e.g. premium front rows) and a **walk-in pool**.
  Staff never seat walk-ins in the online pool without checking the app. Different
  physical sets per channel ⇒ they rarely collide. Ratio is venue-controlled and
  adjustable daily.
- **Layer 2 — Lead time kills the live race.** Online bookings for a day close
  the **evening before**. Staff open each day with a **"today's reservations"
  sheet** and physically reserve those sets before walk-ins arrive. No same-day
  online booking ⇒ no live race.
- **Layer 3 — Staff-assigned seating closes the gap.** In organized clubs staff
  seat guests; the staff member taps the set in the app at the moment of seating,
  so digital and physical happen together.
- **Layer 4 — Graceful fallback.** If a conflict still slips through, the
  **confirmed online booking wins**; staff move the walk-in or give the tourist an
  **equivalent-or-better set**. The guarantee sold is "a set of at least this
  quality at this venue," not that exact lounger. If nothing equivalent is free →
  **automatic full refund + small credit/apology**.

Biggest single lever: **Layer 2 (evening-before cutoff)**, which costs nothing
because it lines up with the cancellation policy.

---

## 8. Data Model (entities)

- **Venue** — name, beach/location (Palasë/Drymades/Dhërmi), photos, description,
  rating, booking mode (Instant/Request), payout details, commission rate.
- **BeachMap / Layout** — belongs to a venue: rows and individual **set
  positions** (e.g. Row A, position 1), each flagged premium/standard with its
  own price; each position assigned to the **online** or **walk-in** pool.
- **Set** — the bookable unit (2 loungers + umbrella) tied to a map position.
- **Availability** — per **set + date**: free / booked-online /
  marked-taken-by-staff. The live source of truth the map renders.
- **Booking** — set, date, price paid, status
  (confirmed/cancelled/completed/no-show), booking code, cancellation deadline.
- **Tourist (Customer)** — name, email, bookings. Guest checkout allowed.
- **Payment** — Stripe charge tied to a booking, plus refund status.
- **Payout** — amount owed to a venue for a period (bookings minus commission) and
  whether transferred.

**Invariant:** availability is **per set, per date**, and *every* channel (online
booking and staff tap-to-mark) writes the same record. This is what guarantees a
tourist and a walk-in can never both hold the same set.

---

## 9. Technical Approach (locked)

- **Front end:** Angular (mobile-friendly responsive web).
- **Back end:** Spring Boot REST API.
- **Database:** PostgreSQL.
- **Payments:** Stripe (collection only), behind a clean payment-gateway
  interface; venue payouts handled by the platform (manual BKT batches).
- **Rationale:** the visual beach-map seat picker with live, conflict-free
  availability is the core differentiator and needs full control — ruling out
  no-code (struggles with real-time custom interactions) and generic booking
  platforms (don't model exact-set-on-a-map). Stack also matches the founder's
  existing Angular + Spring Boot experience.

---

## 10. MVP Scope — v1 vs Later

**In v1 (launch):**
- Tourist web app: browse by beach + date, venue pages with photos/price/rating,
  visual beach map, exact-set selection, in-app payment, booking code + email,
  view/cancel booking.
- Venue tool: onboarding (profile, photos, prices, map layout with pool split),
  Instant Book + Request-to-Book, daily bookings view, tap-to-mark availability,
  "today's reservations" sheet.
- Stripe collection; manual weekly BKT payouts (can be a simple admin report at
  first, not full automation).
- Tiered cancellation + weather refund.
- Phase 1 area only (Palasë, Drymades, Dhërmi).

**Later (post-validation):**
- Native iOS/Android apps.
- Phase 2 areas (Ksamil, Sarandë, beyond).
- Automated/scheduled venue payouts and reconciliation.
- Reviews & ratings beyond a basic score; loyalty/credits.
- Half-day bookings, multi-day, dynamic/seasonal pricing.
- Push notifications, weather-forecast auto-refund automation.

**Explicitly out of scope for v1 (YAGNI):** native apps, same-day booking,
automated payout pipelines, half-day/hourly units, dynamic pricing, anything
outside the Phase 1 beaches.

---

## 11. Key Risks

| Risk | Mitigation |
|---|---|
| Chicken-and-egg (no venues ⇄ no tourists) | Narrow, dense launch area; tourist-first UX; hands-on venue onboarding |
| Walk-in vs online collision | Four-layer model (§7); biggest lever is evening-before cutoff |
| Venue payout legality / intermediary status | Steuerberater review of German entity structure (§5) |
| Staff don't keep the map updated | Dead-simple tap-to-mark UI; separate pools reduce dependence on real-time taps |
| Seasonality (summer-only revenue) | Accept as inherent; keep fixed costs low; expand area to extend coverage |
| Stripe/Albania payout limitation | Resolved: German collection + manual BKT payout (§5) |

---

## 12. Open Questions (for later, non-blocking)

- Exact commission rate (%) and whether it varies by venue.
- Exact cancellation cutoff time (6pm assumed) and partial-refund percentage.
- Whether tourists need accounts or pure guest checkout suffices for v1.
- Deposit vs full prepayment at booking.
- How weather "official bad forecast" is determined (manual admin call vs data
  feed) — v1 likely manual.
