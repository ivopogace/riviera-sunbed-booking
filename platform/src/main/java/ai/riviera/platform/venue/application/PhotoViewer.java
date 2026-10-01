package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Who is reading a venue photo, resolved by the edge from the session. The serving fence lets an
 * {@link Admin} or the owning {@link Operator} see a venue tourists cannot (the console previews);
 * everyone else sees only a tourist-visible venue's photos. Rationale: ADR-0013.
 */
public sealed interface PhotoViewer {

	/** No session, a customer, or an operator principal that resolves to no operable operator. */
	record Anonymous() implements PhotoViewer {
	}

	/** A signed-in operator; bypasses the fence only for the venues it owns (invariant #13). */
	record Operator(OperatorId id) implements PhotoViewer {
	}

	/** A platform admin; bypasses the fence for every venue, as moderation reaches every venue. */
	record Admin() implements PhotoViewer {
	}

	static PhotoViewer anonymous() {
		return new Anonymous();
	}

	static PhotoViewer operator(OperatorId id) {
		return new Operator(id);
	}

	static PhotoViewer admin() {
		return new Admin();
	}
}
