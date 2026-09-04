package ai.riviera.domainpurityfixture.ported.api;

/** A published query port — the shape a domain rule must not take a dependency on. */
public interface FixtureLookup {

	long countFor(long venueId);
}
