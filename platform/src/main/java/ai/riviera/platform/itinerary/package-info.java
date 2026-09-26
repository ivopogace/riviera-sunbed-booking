/**
 * The <strong>itinerary</strong> read model (design D7/D11): the composed dated browse reads over
 * {@code venue}'s map and {@code availability}'s {@code (set, date)} facts — today the whole-coast
 * stay verdict the discovery list carries, later the per-venue itinerary search. Closed: it owns no
 * table and publishes no surface; it reads through the two modules' {@code api} ports only, never
 * {@code venue::spi}. Rationale: RESPONSIBILITIES.md §itinerary.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Itinerary",
	allowedDependencies = { "venue::api", "venue::vocabulary", "availability::api", "shared" }
)
package ai.riviera.platform.itinerary;
