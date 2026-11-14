package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published index of public venue pages (invariant #11): which venues an outsider, such
 * as a crawler, may be pointed at. Fenced on tourist visibility like every tourist read: a venue whose owner is not
 * {@code ACTIVE} is absent. Its own role, apart from {@link VenueCatalog} ({@code VenueApiRoleSplitTests}).
 */
public interface PublicVenueIndex {

	/** Every tourist-visible venue's id, ascending; never {@code null}. */
	List<VenueId> visibleVenueIds();
}
