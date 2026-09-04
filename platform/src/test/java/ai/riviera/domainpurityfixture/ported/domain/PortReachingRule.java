package ai.riviera.domainpurityfixture.ported.domain;

import ai.riviera.domainpurityfixture.ported.api.FixtureLookup;

/** Impure: a domain rule that asks a port instead of taking its inputs as values. */
public final class PortReachingRule {

	private PortReachingRule() {
	}

	public static boolean any(FixtureLookup lookup, long venueId) {
		return lookup.countFor(venueId) > 0;
	}
}
