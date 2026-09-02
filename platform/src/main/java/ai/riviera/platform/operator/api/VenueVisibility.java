package ai.riviera.platform.operator.api;

import java.util.Collection;
import java.util.Set;

import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * The {@code operator} module's published tourist-visibility port — a synchronous inbound query
 * answering, per venue, whether its owning operator is {@code ACTIVE}. This is the one home of the
 * platform rule: <strong>a venue is visible to tourists iff its owning operator is
 * {@code ACTIVE}</strong>; a venue with no ownership row has no {@code ACTIVE} owner and is not
 * visible (fail-closed). Approval flips a venue live with no further action, suspension hides it,
 * reinstatement shows it again.
 *
 * <p>Consumers fence <em>discovery and new bookings</em> only: {@code venue} filters its tourist
 * reads (the discovery list, the beach map, the availability calendar and the public review list),
 * {@code booking} refuses a reserve attempt. Sold-booking paths (code-gated view,
 * cancel, check-in, mails) deliberately never consult this port — a booking made while the venue
 * was visible keeps working. Rationale: RESPONSIBILITIES.md §operator.
 */
public interface VenueVisibility {

	/** Whether {@code venue} currently has an {@code ACTIVE} owning operator. */
	boolean isVisible(VenueRef venue);

	/**
	 * The subset of {@code venues} that currently have an {@code ACTIVE} owning operator — the
	 * batch form for list reads. An empty input answers an empty set.
	 */
	Set<VenueRef> visibleAmong(Collection<VenueRef> venues);
}
