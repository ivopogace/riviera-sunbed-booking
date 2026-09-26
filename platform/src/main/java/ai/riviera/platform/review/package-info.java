/**
 * The review module: a tourist's verdict on a delivered stay — one review per booking, its 60-day
 * window, the author's edits, the aggregate rating, the public listing, and erasure's tombstone (name
 * and comment blanked, star kept; ADR-0010). <strong>A leaf</strong> (ADR-0015): calling
 * {@code booking}, hearing its events, or reusing its or {@code venue}'s id types closes a cycle
 * (e.g. {@code venue → review → booking → venue}), so facts arrive via {@code spi.CompletedStays}
 * and typed ids are its own (invariant #11). It computes the aggregate; {@code venue} stores it.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Review",
	allowedDependencies = { "shared" }
)
package ai.riviera.platform.review;
