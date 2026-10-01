/**
 * The <strong>remodel</strong> composition (ADR-0020, placed by ADR-0028): the beach-map remodel
 * preview and commit, composing {@code venue}'s layout diff and write with {@code booking}'s claim
 * classification and settlement, since neither module may see the other. Closed: it owns no table
 * and publishes no surface; it supplies {@code venue.spi.RemodelGate}. Each port asserts ownership
 * itself (#13); this module assembles and does not decide. Rationale: RESPONSIBILITIES.md §remodel.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Remodel",
	allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "booking::api",
			"booking::vocabulary", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.remodel;
