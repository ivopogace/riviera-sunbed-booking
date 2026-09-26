package ai.riviera.platform.operator.api;

import java.util.Collection;
import java.util.Set;

import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * Tourist-visibility query, the one home of the rule: a venue is visible to tourists iff its
 * owning operator is {@code ACTIVE}; a venue with no ownership row is not visible (fail-closed).
 * Approval shows a venue, suspension hides it, reinstatement shows it again.
 *
 * <p>Fences discovery and new bookings only: {@code venue}'s discovery list, beach map, calendar
 * and public reviews, and {@code booking}'s reserve. Sold-booking paths (code-gated view, cancel,
 * check-in, mails) never consult it. Rationale: RESPONSIBILITIES.md §operator.
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
