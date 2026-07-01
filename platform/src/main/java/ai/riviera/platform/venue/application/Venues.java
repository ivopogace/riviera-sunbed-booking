package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Outbound (driven) port: the venue write store (U7). Internal to the module — implemented by
 * the module's own {@code adapter.out} JDBC adapter, so it is NOT published in {@code api/}
 * (invariant #11). Keeps the application service free of SQL; the adapter is the only place that
 * knows the tables. Existence/conflict probes let the service return a precise outcome; the DB
 * UNIQUE constraints remain the race-safe backstop.
 */
public interface Venues {

	/** Insert a venue and return its generated id. */
	long insertVenue(NewVenueCommand command);

	/** Whether a venue with this id exists. */
	boolean venueExists(VenueId venueId);

	/** Whether the set with this id belongs to the venue. */
	boolean setExists(VenueId venueId, SetId setId);

	/**
	 * The layout conflict the command would cause on the venue, if any. {@code exclude} is the
	 * set being edited (so it doesn't conflict with itself), or empty when adding.
	 */
	Optional<Conflict> findConflict(VenueId venueId, SetCommand command, Optional<SetId> exclude);

	/** Insert a set position and return its generated id. */
	long insertSet(VenueId venueId, SetCommand command);

	/**
	 * Overwrite a set position's layout fields. Returns the number of rows changed — {@code 0}
	 * means no such set belongs to the venue (e.g. it was deleted concurrently after the caller's
	 * existence check), so the caller must not report success.
	 */
	int updateSet(VenueId venueId, SetId setId, SetCommand command);

	/** Remove a set position. Returns the number of rows deleted — {@code 0} means no such set. */
	int deleteSet(VenueId venueId, SetId setId);

	/** A layout-uniqueness conflict, in priority order for reporting. */
	enum Conflict {
		/** Another set holds the target {@code (row_label, position_no)} slot. */
		DUPLICATE_POSITION,
		/** Another set holds the target {@code (grid_x, grid_y)} cell. */
		CELL_TAKEN
	}
}
