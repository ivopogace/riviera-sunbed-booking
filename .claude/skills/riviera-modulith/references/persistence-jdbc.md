# Persistence — `JdbcClient` + explicit SQL, and where it sits in the hexagon

JPA/Hibernate is forbidden (invariant #1). Persistence is `JdbcClient` + explicit text-block
SQL — the tree's one uniform choice, with no `CrudRepository`, `@Table` or `@Id` anywhere in
it. Language-level detail: `riviera-java-conventions` §1, and its §1a for the Spring Data JDBC
aggregate question the tree has never answered yes; SQL/schema/index craft: `postgres`. This
file covers where persistence sits in the hexagon.

## The pattern: `JdbcClient` + explicit SQL (what every existing adapter does)

A driven adapter in `adapter/out`, package-private, implementing an `api/` port (thin
module) or an internal `application/` port directly with named-parameter SQL in a text
block. No repository interface, no aggregate, no `@Id`/`@Table`. This is `JdbcVenueCatalog`,
`JdbcAvailabilityClaim`, `JdbcCustomerDirectory`, `JdbcBookings`.

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

- **Map typed ids to primitives** at the SQL boundary (`setId.value()`); reconstruct typed
  ids / records in the `RowMapper`.
- **The atomic claim / upsert is `INSERT ... ON CONFLICT (...) DO NOTHING`** — the
  concurrency primitive for invariant #2 (`JdbcAvailabilityClaim`) and for unique-code
  retries (`JdbcBookings`). A thrown unique violation would poison the surrounding
  transaction; `ON CONFLICT` makes a collision a normal empty result.
- **Schema is Flyway only** (invariant #12) — no `ddl-auto`, no generated schema.

## JPA anti-patterns to REFUSE (convert and say why)

| JPA (refuse) | Use instead |
|---|---|
| `@jakarta.persistence.Entity` / that pkg's `@Table` | `JdbcClient` + explicit SQL in a package-private `adapter/out` class |
| `extends JpaRepository<...>` | no repository interface at all — `JdbcClient` behind the module's own port |
| `@OneToMany`/`@ManyToOne`/`@ManyToMany` | a typed-id column and a second query; a join is written in the SQL |
| lazy loading / `FetchType` / persistence context / dirty checking | an explicit `JdbcClient` query, and an explicit `INSERT`/`UPDATE` |
| `spring-boot-starter-data-jpa` | `spring-boot-starter-data-jdbc` (already on the classpath) |
| MapStruct entity↔DTO mappers | hand-map at the adapter edge; keep `domain` free of DTOs |
| bidirectional associations across modules | publish a domain event; reference by id |

Because a row is reached only by a query this module wrote — no association to traverse, no
lazy load to trigger — a `booking`-module write physically cannot drag `venue` rows into its
object graph. When `booking` needs venue data it calls `venue.api.VenueCatalog` with the id
(`setBookingInfo(SetId)`). The boundary is real at the persistence layer.
