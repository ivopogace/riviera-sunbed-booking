# Persistence — `JdbcClient` + explicit SQL

A package-private driven adapter in `adapter/out` implements an `api/` port (thin module) or
an internal `application/` port with named-parameter SQL in a text block. No repository
interface, no aggregate, no `@Id`/`@Table` (`JdbcVenueCatalog`, `JdbcAvailabilityClaim`,
`JdbcCustomerDirectory`, `JdbcBookings`). Language detail: `riviera-java-conventions` §1/§1a;
schema craft: `postgres`.

```java
@Repository
class JdbcBookings implements Bookings {
    private final JdbcClient jdbc;

    JdbcBookings(JdbcClient jdbc) { this.jdbc = jdbc; }

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

- Typed ids become primitives at the SQL edge; the `RowMapper` reconstructs them.
- The atomic claim/upsert is `INSERT … ON CONFLICT (...) DO NOTHING` (#2,
  `JdbcAvailabilityClaim`): a thrown unique violation would poison the transaction; `ON
  CONFLICT` makes a collision an empty result.
- Schema is Flyway only (#12); no `ddl-auto`.

| Refuse | Use instead |
|---|---|
| `@jakarta.persistence.Entity` / `@Table` | `JdbcClient` + SQL in a package-private `adapter/out` class |
| `extends JpaRepository` | no repository interface; `JdbcClient` behind the module's port |
| `@OneToMany`/`@ManyToOne` | a typed-id column and a second query, or a SQL join |
| lazy loading / dirty checking | explicit query, explicit `INSERT`/`UPDATE` |
| `spring-boot-starter-data-jpa` | `spring-boot-starter-data-jdbc` (already present) |
| MapStruct entity↔DTO | hand-map at the adapter edge |
| cross-module associations | an event, and a reference by id |

A row is reached only by a query this module wrote, so a `booking` write cannot drag `venue`
rows into its graph; `booking` calls `venue.api.VenueCatalog` with the id.
