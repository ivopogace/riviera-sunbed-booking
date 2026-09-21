# Persistence — `JdbcClient` + explicit SQL

A package-private driven adapter in `adapter/out` implements an `api/` port (thin module) or
an internal `application/` port with named-parameter SQL in a text block. No repository
interface, no aggregate, no `@Id`/`@Table`. Models: `JdbcBookings`, `JdbcAvailabilityClaim`.
Language detail: `riviera-java-conventions` §1/§1a; schema craft: `postgres`.

- Typed ids become primitives at the SQL edge; the `RowMapper` reconstructs them.
- The atomic claim/upsert is `INSERT … ON CONFLICT (...) DO NOTHING` (#2,
  `JdbcAvailabilityClaim`): a thrown unique violation would poison the transaction; `ON
  CONFLICT` makes a collision an empty result.
- Schema is Flyway only (#12); no `ddl-auto`.
- No JPA-style associations or MapStruct: a typed-id column plus a second query or a join;
  hand-map at the adapter edge.

A row is reached only by a query this module wrote, so a `booking` write cannot drag `venue`
rows into its graph; `booking` calls `venue.api.SetBookingFacts` with the id.
