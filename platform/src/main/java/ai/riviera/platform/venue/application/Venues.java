package ai.riviera.platform.venue.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Outbound (driven) port: the venue write store. Internal to the module — implemented by
 * the module's own {@code adapter.out} JDBC adapter, so it is NOT published in {@code api/}
 * (invariant #11). Keeps the application service free of SQL; the adapter is the only place that
 * knows the tables. Existence/conflict probes let the service return a precise outcome; the DB
 * UNIQUE constraints remain the race-safe backstop.
 */
public interface Venues {

	/**
	 * Insert a venue and return its generated id. {@code commissionBps} is the rate the caller
	 * stamps — the platform default from {@link VenueCreationProperties}, never client input.
	 */
	long insertVenue(NewVenueCommand command, int commissionBps);

	/** Whether a venue with this id exists. */
	boolean venueExists(VenueId venueId);

	/**
	 * Lock the venue row {@code FOR UPDATE} and read its {@code set_version} token (not the profile
	 * {@code version}). The first lock every set-write takes — venue row before set rows, so no
	 * deadlock; it does NOT increment — {@link #incrementSetVersion} does, on success only.
	 */
	long lockAndReadSetVersion(VenueId venueId);

	/**
	 * Advance the venue's {@code set_version} by one, ONLY after a set-write succeeds; race-free because
	 * the caller holds the venue row lock from {@link #lockAndReadSetVersion}.
	 */
	void incrementSetVersion(VenueId venueId);

	/**
	 * Lock one active set {@code FOR UPDATE} (invariant #2/#3 guard: a racing claim's FK or pool read
	 * waits), or empty if absent or retired. Callers take no venue row lock; one that adds it must take
	 * {@link #lockAndReadSetVersion} <em>first</em> or deadlock against a concurrent replace.
	 */
	Optional<SetPlacement> lockSet(VenueId venueId, SetId setId);

	/**
	 * The layout conflict the command would cause on the venue, if any. {@code exclude} is the
	 * set being edited (so it doesn't conflict with itself), or empty when adding.
	 */
	Optional<Conflict> findConflict(VenueId venueId, SetCommand command, Optional<SetId> exclude);

	/** Insert a set position and return its generated id. */
	long insertSet(VenueId venueId, SetCommand command);

	/**
	 * Overwrite a set position's layout fields. The caller has already pinned the row with
	 * {@link #lockSet} in the same transaction, so the set cannot vanish underneath this write and
	 * there is no rows-affected signal to interpret.
	 */
	void updateSet(VenueId venueId, SetId setId, SetCommand command);

	/**
	 * Give each named active set a transient row label (control char + own id) so a save that swaps
	 * or rotates row names never collides on the layout-uniqueness index; the final labels follow in
	 * the same transaction. Never called with an empty collection.
	 */
	void parkRowLabels(VenueId venueId, Collection<SetId> setIds);

	/**
	 * Remove a set position that carries no booking. As with {@link #updateSet}, the caller holds the
	 * row lock from {@link #lockSet}, so a 0-row delete is not reachable and is not reported.
	 */
	void deleteSet(VenueId venueId, SetId setId);

	/**
	 * Retire a set with booking history: stamp {@code retired_at} (UTC, invariant #6) and keep the row
	 * (ADR-0019); it then drops from every read but {@code SetBookingFacts}. The caller holds
	 * {@link #lockSet}, which reads the active map, so a set is never retired twice.
	 */
	void retireSet(VenueId venueId, SetId setId, Instant retiredAt);

	/**
	 * Overwrite {@code price_minor}/{@code price_currency} on every set in {@code command.rowLabel()},
	 * touching no other column. Returns rows changed; {@code 0} means no such row ({@code NO_SUCH_ROW}).
	 */
	int repriceRow(VenueId venueId, RowPriceCommand command);

	/**
	 * Every distinct {@code row_label} on the venue's map — one read answers both of a rename's
	 * questions (does the row exist, is the new label taken), so the two cannot disagree.
	 */
	Set<String> distinctRowLabels(VenueId venueId);

	/**
	 * Overwrite {@code row_label} on every set in {@code command.rowLabel()}, touching no other column.
	 * Returns rows changed; {@code 0} means no such row ({@code NO_SUCH_ROW}).
	 */
	int renameRow(VenueId venueId, RowNameCommand command);

	/**
	 * Ids of every active set, <strong>without locking</strong> (empty when none), for reads. The bulk
	 * save uses {@link #lockSetsOfVenue}, whose {@code FOR UPDATE} a read must never take.
	 */
	List<SetId> setIdsOf(VenueId venueId);

	/**
	 * The venue's current {@code set_version} <strong>without locking</strong> — the token a remodel
	 * preview compares against — or empty for an unknown venue. A write reads it through
	 * {@link #lockAndReadSetVersion} instead.
	 */
	OptionalLong setVersionOf(VenueId venueId);

	/**
	 * Every active set with its placement, in id order, <strong>without locking</strong> — what the
	 * remodel preview diffs against. A snapshot: the save re-reads through {@link #lockSetsOfVenue}.
	 */
	List<PlacedSet> placedSetsOf(VenueId venueId);

	/**
	 * Every active set with its placement, in id order, locked {@code FOR UPDATE} — the bulk save's
	 * invariant-#2 guard: a racing claim's FK {@code FOR KEY SHARE} blocks until commit, so no hold is
	 * {@code ON DELETE CASCADE}-swept by {@link #deleteSet} after the claim probe.
	 */
	List<PlacedSet> lockSetsOfVenue(VenueId venueId);

	/**
	 * Lock the named sets of the venue {@code FOR UPDATE} (as {@link #lockSet}) and return the ids found
	 * — fewer means a foreign id. Take after {@link #lockAndReadSetVersion}; never called with an empty
	 * collection.
	 */
	Set<SetId> lockSets(VenueId venueId, Collection<SetId> setIds);

	/**
	 * Overwrite only the columns {@code command} touches (tier, pool, price) on every named set in one
	 * {@code UPDATE}; returns rows changed. The caller holds the rows from {@link #lockSets}.
	 */
	int updateSetFields(VenueId venueId, SetBatchCommand command);

	/**
	 * Insert the new sets of a bulk beach-map save in one unit of work. The caller runs this inside
	 * the same {@code @Transactional} boundary as the save's removals and in-place updates, after the
	 * refusal check, so the map is never left partially saved. An empty list inserts nothing.
	 */
	void insertSets(VenueId venueId, List<SetCommand> sets);

	/**
	 * Replace the editable profile fields and the amenity set, conditional on {@code expectedVersion}
	 * (bumped on success); commission and payout currency are never written. Returns {@code 0} on a
	 * version mismatch (STALE_WRITE, amenities untouched), else {@code 1}.
	 */
	int updateVenueProfile(VenueId venueId, long expectedVersion, VenueProfileCommand command);

	/**
	 * Replace the venue's season closure with {@code closure} (a closed value), stamped
	 * {@code closedAt} (a UTC instant, invariant #6). Touches no other column and no token: the
	 * profile {@code version} is the form's, and this state change rides no form.
	 */
	void closeForSeason(VenueId venueId, SeasonClosure closure, Instant closedAt);

	/** Clear the venue's season closure — the three columns back to open. Idempotent. */
	void reopenForSeason(VenueId venueId);

	/**
	 * The venue's console profile (editable core plus read-only commission and payout currency), or
	 * empty if unknown. The caller has asserted ownership (invariant #13); the platform admin writes
	 * the rate through {@link CommissionRateStore}.
	 */
	Optional<VenueProfileView> findProfile(VenueId venueId);

	/**
	 * Picker summaries for {@code ids}, ordered by name; missing ids are absent. No authorization of its
	 * own — never call it with ids not already filtered to the operator's venues, nor with none.
	 */
	List<OwnedVenueView> findSummaries(Collection<VenueId> ids);

	/** A layout-uniqueness conflict, in priority order for reporting. */
	enum Conflict {
		/** Another set holds the target {@code (row_label, position_no)} slot. */
		DUPLICATE_POSITION,
		/** Another set holds the target {@code (grid_x, grid_y)} cell. */
		CELL_TAKEN
	}
}
