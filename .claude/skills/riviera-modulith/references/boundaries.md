# Declaring boundaries — `@ApplicationModule`, grants, and `api` vs `spi`

The boundary-declaration mechanics behind the SKILL.md body. Everything here is enforced by
`ApplicationModules.verify()` (`ai.riviera.platform.ModularityTests`).

## Declaring a module

Each module declares a display name **and an explicit `allowedDependencies` deny-list** — this is
**already true of every module in `main`** (`booking`, `availability`, `payout`, `venue`,
`payment`, `customer`, `operator` all set it), not a future tightening. Keep it that way:

```java
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    allowedDependencies = { "booking::api", "booking::events", "booking::vocabulary",
        "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.payout;
```

(`booking::api` joined the list at #171 — the console daily-takings read — so `payout` is no longer
a listener-only consumer of `booking`; the grant grew with the code, per the matrix below.)

and each module exposes its published surfaces (`api/`, and `spi/` where present):

```java
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
```

## The least-privilege grant matrix (issue #95)

Grants name the **narrowest named interfaces** the consumer's bytecode actually needs:

- A **port caller** lists `<provider>::api` + `::vocabulary` (the types the port speaks).
- A **listener-only consumer** lists `<provider>::events` + `::vocabulary` — never a command
  surface. (No module is purely listener-only today — `payout` was until #171 added a query-port
  grant — but the rule still bounds any *new* listener-only consumer.)
- The **implementing** module of a driven port lists `<provider>::spi` (plus `<provider>::api` if
  it also calls it); a module that only *calls* the provider lists `<provider>::api` only —
  never `::spi`.

**`allowedDependencies` must list every module the code legitimately uses or `verify()` fails** —
so when you add a genuinely new, non-cyclic dependency, add it to the list in the same change and
run `ModularityTests` immediately. A failure is the design being wrong (an unintended coupling),
not the test being fussy. **Never** widen the list to silence a `verify()` failure without
understanding the new edge.

**A new module must declare its deny-list from creation** (the way `operator` did at #73) — don't
ship a module with no `allowedDependencies` and "tighten later." Deny-by-default is the standard here.

## `api` vs `spi`: inbound ports vs cross-module driven ports

A module's `api/` (`@NamedInterface("api")`) is its **inbound / driving** surface — interfaces
other modules **call** (`VenueCatalog`, `AvailabilityClaim`). The caller depends on the provider;
call direction == dependency direction. **This is the default — reach for it first.**

A module's **driven / outbound** port normally stays **internal** in `application/` (alongside its
service), implemented by the module's *own* `adapter/out` adapter — it is *not* published. Promote
a driven port to a published named interface **only** when its adapter must live in **another
module** — i.e. a cross-module **dependency inversion**, done to keep the graph acyclic. When you
do, put it in a dedicated **`spi`** named interface (`<module>.spi`, `@NamedInterface("spi")`),
**never** in `api/`:

- `api/` answers *"what others call me to do"* (inbound / driving).
- `spi/` answers *"what I need another module to implement for me"* (driven / inverted).

**Worked example — the `venue ↔ availability` live-map read (issue #44).** `venue` needs "which of
these sets are taken on date D?" but must not depend on `availability` (that would cycle —
`availability` already depends on `venue::api` for the claim's pool check). So `venue` declares the
driven port `SetAvailabilityLookup` in **`venue.spi`**; `availability` **implements** it (its
grants include `venue::spi` to implement the port, plus `venue::api`/`venue::vocabulary` for the
ports and ids it uses — see the module's package-info for the full least-privilege list);
`venue`'s `JdbcVenueCatalog` calls it. The compile-time edge stays `availability → venue`
(acyclic); the runtime call goes `venue → availability`. `booking`, which only *calls* venue, is
granted `venue::api` only — never `venue::spi`. (`SetId` and the other shared vocabulary live in
`venue.vocabulary` since issue #95; only the *driven port* lives in `spi/`.)

**Decision rule.** Inbound port (others call) → `api`. Driven port implemented in-module →
`application/` (internal, unpublished). Driven port implemented by **another** module → `spi`. If
you're tempted to put an "implement-me" interface in `api/`, that is exactly the smell this rule
fixes — `riviera-review-overlay` (RV-BE-3b) flags it at the review gate.
