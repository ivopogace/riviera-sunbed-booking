# Persistence — `JdbcClient` + SQL first; Spring Data JDBC aggregate only when it earns it

JPA/Hibernate is forbidden (invariant #1). This project's **default** persistence is
**`JdbcClient` + explicit text-block SQL**, not Spring Data JDBC aggregates. That is the inverse of
most tutorials — get it right. (Language-level detail lives in `riviera-java-conventions` §1/§1a;
SQL/schema/index craft in `postgres`. This file covers where persistence sits in the hexagon.)

## Default: `JdbcClient` + explicit SQL (what every existing adapter does)

A driven adapter in `infrastructure/out`, package-private, implementing an `api/` or
`application/out` port directly with named-parameter SQL in a text block. No repository interface, no
aggregate, no `@Id`/`@Table`. This is `JdbcVenueCatalog`, `JdbcAvailabilityClaim`,
`JdbcCustomerDirectory`, `JdbcBookings`.

```java
// ai.riviera.platform.<module>.infrastructure.out — package-private adapter
@Repository
class JdbcBookings implements Bookings {                 // implements an application.out port

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

Rules:
- **Bind named params** (`:id`), never string-concatenate. SQL lives in a `"""text block"""` next to
  the call.
- **Return `Optional<T>`** (or a typed outcome) from query ports — never `null`.
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
mapping — and keep it inside the module, behind a port. Full rules in `riviera-java-conventions` §1a;
the essentials:

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

- One `ListCrudRepository`/custom `o.s.data.repository.Repository` **per aggregate root only**
  (Spring Data JDBC, not `JpaRepository`). Queries are **SQL** via `@Query` (not JPQL).
- Cross-aggregate links are **ids** (`Long setId` / `AggregateReference`), never an embedded object.
- **No cascade between aggregates** — a cross-aggregate effect is a second explicit `save` or a
  domain event, never a persistence cascade. (This is the storage-level shape of the U5 event spine.)
- `save` is explicit — no dirty checking.

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
