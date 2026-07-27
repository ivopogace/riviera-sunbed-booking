# Persistence — `JdbcClient` + SQL first; Spring Data JDBC aggregate only when it earns it

JPA/Hibernate is forbidden (invariant #1). This project's **default** persistence is
**`JdbcClient` + explicit text-block SQL**, not Spring Data JDBC aggregates. That is the inverse of
most tutorials — get it right. (Language-level detail lives in `riviera-java-conventions` §1;
SQL/schema/index craft in `postgres`. This file covers where persistence sits in the hexagon and is
the **canonical home of the Spring Data JDBC aggregate rules** — `riviera-java-conventions` §1a
points here.)

## Default: `JdbcClient` + explicit SQL (what every existing adapter does)

A driven adapter in `adapter/out`, package-private, implementing an `api/` port (thin module)
or an internal `application/` port directly with named-parameter SQL in a text block. No repository interface, no
aggregate, no `@Id`/`@Table`. This is `JdbcVenueCatalog`, `JdbcAvailabilityClaim`,
`JdbcCustomerDirectory`, `JdbcBookings`.

```java
// ai.riviera.platform.<module>.adapter.out — package-private adapter
@Repository
class JdbcBookings implements Bookings {                 // implements an internal application/ port

    private final JdbcClient jdbc;

    JdbcBookings(JdbcClient jdbc) {                       // constructor injection, final field
        this.jdbc = jdbc;
    }

    @Override
    public OptionalLong insertAwaitingPayment(NewBooking b) {
        return jdbc.sql("""
                INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
                                     amount_minor, amount_currency, status)
                VALUES (:code, :venue, :set, :customer, :date, :amount, :currency, :status)
                ON CONFLICT (code) DO NOTHING
                RETURNING id
                """)
                .param("code", b.code())
                .param("venue", b.venueId().value())     // typed id -> primitive at the SQL edge
                /* ... */
                .query(Long.class).optional()
                .map(OptionalLong::of).orElseGet(OptionalLong::empty);
    }
}
```

Rules (the SQL/injection/`Optional` idioms themselves are `riviera-java-conventions` §1/§3/§5 —
what belongs *here* is placement and the concurrency primitive):
- **Map typed ids to primitives** at the SQL boundary (`setId.value()`); reconstruct typed ids /
  records in the `RowMapper`.
- **The atomic claim / upsert is `INSERT ... ON CONFLICT (...) DO NOTHING`** — the concurrency
  primitive for invariant #2 (`JdbcAvailabilityClaim`) and for unique-code retries (`JdbcBookings`).
  A thrown unique violation would poison the surrounding transaction; `ON CONFLICT` makes a
  collision a normal empty result instead.
- **Schema is Flyway only** (invariant #12) — no `ddl-auto`, no generated schema.

## Exception: a Spring Data JDBC aggregate (only when a row cluster is ONE consistency unit)

Reach for an aggregate **only** when a root and its children are loaded, mutated, and saved together
as a unit (e.g. a future `Booking` that owns line-items). Then follow Spring Data **JDBC** (not JPA)
mapping — and keep it inside the module, behind a port. These are the **canonical rules** — they keep
the aggregate aligned with the Modulith boundaries (invariant #11), and several are the
persistence-level form of decisions we already made:

```java
// domain/model — Spring Data RELATIONAL annotations only (NOT jakarta.persistence)
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.MappedCollection;
import org.springframework.data.relational.core.mapping.Table;

@Table("booking")
class Booking {
    @Id private Long id;
    private Long setId;                                   // reference to ANOTHER aggregate by id
    @MappedCollection(idColumn = "booking_id", keyColumn = "position")
    private List<BookingLine> lines = new ArrayList<>();  // OWNED children, saved with the root
}
```

- **The aggregate is the consistency + transaction boundary.** One `ListCrudRepository`/custom
  `o.s.data.repository.Repository` **per aggregate root only** (Spring Data JDBC, not
  `JpaRepository`) — never a repository for an entity that lives *inside* an aggregate. Save the
  root; it persists its children. Queries are **SQL** via `@Query` (not JPQL).
- **Cross-aggregate references are by id, never by object** (`Long setId` / `AggregateReference`,
  never an embedded instance). A `Booking` holds a `SetId`/`CustomerId`, not a `Set`/`Customer` —
  the same rule invariant #11 puts on event payloads, and exactly why `SetId` lives in
  `venue.vocabulary` (#95).
- **No cascade between aggregates.** Saving one aggregate must never save another — aggregates are
  autonomous. A cross-aggregate effect is a second explicit `save` or a domain event, never a
  persistence cascade. (This is the storage-level shape of the U5 event spine: `BookingConfirmed` →
  availability marks the set **and** payout accrues, as two independent writes — not one cascading
  save.)
- **Inside an aggregate, references go root → child only, and unidirectional.** No child→root
  back-reference, no bidirectional object graphs; the child row carries the root's FK in the DB.
- **Model M:N join tables explicitly** as their own type (e.g. a `ProductCategory` row). Spring
  Data JDBC has no JPA-style hidden join table — and explicit is what we want anyway.
- **`save` is explicit.** There is no JPA dirty-checking / autoflush: a load-then-mutate with no
  `save` persists nothing. Write the `save`.
- **Mind the imports** (the classic footgun): `org.springframework.data.annotation.@Id` and
  `org.springframework.data.relational.core.mapping.@Table`/`@Column`/`@MappedCollection` — never
  the `jakarta.persistence` annotations of the same simple name.

*(Aggregate rules distilled from a JPA→Spring Data JDBC migration write-up — we have no JPA to
migrate, but these are the right way to use Spring Data JDBC from the start.)*

## JPA anti-patterns to REFUSE (convert and say why)

| JPA (refuse) | Use instead |
|---|---|
| `@jakarta.persistence.Entity` / that pkg's `@Table` | `JdbcClient` + SQL (default), or `o.s.data.relational...@Table` on a real aggregate |
| `extends JpaRepository<...>` | default to no repository (`JdbcClient`); else `ListCrudRepository` (Spring Data JDBC) |
| `@OneToMany`/`@ManyToOne`/`@ManyToMany` | `@MappedCollection` for owned children; **typed-id reference** across aggregates |
| lazy loading / `FetchType` / persistence context / dirty checking | explicit `JdbcClient` query, or explicit `repository.save(root)` |
| `spring-boot-starter-data-jpa` | `spring-boot-starter-data-jdbc` (already on the classpath) |
| MapStruct entity↔DTO mappers | hand-map at the adapter edge; keep `domain` free of DTOs |
| bidirectional associations across modules | publish a domain event; reference by id |

## Cross-module rule restated

Because references across aggregates are ids and there is no lazy loading, a `booking`-module write
physically cannot drag a `venue` aggregate into its graph. When `booking` needs venue data it calls
`venue.api.VenueCatalog` (a port) with the id — that is exactly how U3's `setBookingInfo(SetId)`
works. The boundary is real at the persistence layer, not just the package layer.
