package ai.riviera.platform.venue.application;

import java.util.Collection;
import java.util.List;
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

	/**
	 * Lock the venue row and read its current {@code set_version} optimistic-concurrency token —
	 * {@code SELECT set_version FROM venue WHERE id = :id FOR UPDATE}. The token is the SEPARATE counter
	 * for the two operator set-position writes (beach-map replace + per-row reprice), distinct from the
	 * profile {@code version}. The caller (having pre-checked existence) compares the returned value
	 * to the loaded {@code expectedVersion}: a mismatch means another writer advanced it since the load →
	 * STALE_WRITE. This is the <strong>first</strong> lock both set-writes take — before
	 * {@link #lockSetsOfVenue}'s / {@link #repriceRow}'s {@code set_position} locks — so both acquire the
	 * venue row before its set rows (one consistent order → no deadlock, R-1). Crucially it does NOT
	 * increment: the token is advanced by {@link #incrementSetVersion} <strong>only on the success path</strong>,
	 * so a rejected write (LAYOUT_IN_USE / NO_SUCH_ROW) never spuriously advances it and self-conflicts the
	 * acting tab's own retry (review finding; the earlier bump-first-then-reject persisted the bump).
	 */
	long lockAndReadSetVersion(VenueId venueId);

	/**
	 * Advance the venue's {@code set_version} by one — {@code UPDATE venue SET set_version =
	 * set_version + 1 WHERE id = :id} — called ONLY after a set-write commits (the layout was replaced /
	 * the row repriced). The caller already holds the venue row lock from {@link #lockAndReadSetVersion},
	 * so this is race-free; a concurrent writer blocked on that lock re-reads the advanced value and gets
	 * STALE_WRITE.
	 */
	void incrementSetVersion(VenueId venueId);

	/**
	 * Lock one set row and read its current {@link SetPlacement} — {@code SELECT … WHERE id = :setId
	 * AND venue_id = :venue FOR UPDATE} — or empty when no such set belongs to the venue. The
	 * per-set counterpart of {@link #lockSetsOfVenue}: the {@code FOR UPDATE} is the invariant-#2
	 * guard for {@code editSet}/{@code removeSet}, because a concurrent {@code set_availability} or
	 * {@code booking} insert needs {@code FOR KEY SHARE} on this row for its FK check and therefore
	 * blocks until the edit commits — closing the window in which a claim committed after the claim
	 * probe would be CASCADE-swept by the delete or stranded by a pool flip. Empty doubles as the
	 * existence check, so the caller needs no separate probe.
	 *
	 * <p><strong>Lock ordering.</strong> The per-set writes take this lock and <em>no other</em> —
	 * in particular they never take the venue row, so they cannot form a cycle with the
	 * venue→sets order {@link #lockAndReadSetVersion} establishes for the bulk replace and the row
	 * reprice. That is a property of the current callers, not a guarantee of this method: if
	 * {@code editSet}/{@code removeSet} ever grow a venue-row touch (an {@code incrementSetVersion}
	 * so a per-set edit invalidates a stale console token, say), they must take
	 * {@link #lockAndReadSetVersion} <em>first</em> or they will deadlock against a concurrent
	 * replace holding the venue row and waiting on this one.
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
	 * Remove a set position. As with {@link #updateSet}, the caller holds the row lock from
	 * {@link #lockSet}, so a 0-row delete is not reachable and is not reported.
	 */
	void deleteSet(VenueId venueId, SetId setId);

	/**
	 * Reprice every set in a row of the venue in one non-destructive {@code UPDATE}:
	 * overwrite {@code price_minor}/{@code price_currency} for every {@code set_position} carrying
	 * {@code command.rowLabel()}. Touches no other column, so set identity, pool and any
	 * {@code set_availability} hold survive. Returns the number of set rows changed — {@code 0} means the
	 * venue has no set with that row label, so the caller returns {@code NO_SUCH_ROW}.
	 */
	int repriceRow(VenueId venueId, RowPriceCommand command);

	/**
	 * The ids of every set currently on the venue's map, <strong>without locking</strong> — the
	 * plain read the owner's daily availability view composes with the per-day states.
	 * Empty when the venue has no sets. For the bulk layout replace use {@link #lockSetsOfVenue},
	 * whose {@code FOR UPDATE} is that write's invariant-#2 guard; a read must never take it.
	 */
	List<SetId> setIdsOf(VenueId venueId);

	/**
	 * The ids of every set currently on the venue's map, <strong>locking those rows</strong>
	 * ({@code SELECT … FOR UPDATE}) for the caller's transaction (empty when the venue has no sets).
	 * The lock is the invariant-#2 guard for the bulk layout replace: a concurrent
	 * {@code set_availability}/{@code booking} insert takes a {@code FOR KEY SHARE} lock on the
	 * referenced {@code set_position} row (its FK check), which conflicts with this {@code FOR UPDATE},
	 * so it blocks until the replace commits or rolls back. That closes the check-then-delete window in
	 * which a hold committed after the availability probe would otherwise be silently
	 * {@code ON DELETE CASCADE}-swept by {@link #deleteAllSets}.
	 */
	List<SetId> lockSetsOfVenue(VenueId venueId);

	/** Delete every set position of the venue. Returns the number of rows deleted. */
	int deleteAllSets(VenueId venueId);

	/**
	 * Insert every set of a fresh layout for the venue in one unit of work. The caller
	 * runs this inside the same {@code @Transactional} boundary as {@link #deleteAllSets}, after having
	 * verified the venue is unclaimed, so the map is never left partially replaced.
	 */
	void insertSets(VenueId venueId, List<SetCommand> sets);

	/**
	 * Replace a venue's editable profile fields in one unit of work: name/beach/region/description,
	 * booking mode, booking cutoff, the amenity set, and distance-to-water. Commission and payout
	 * currency are read-only and never written. The
	 * write is <strong>conditional on {@code expectedVersion}</strong> — the optimistic-concurrency
	 * token the tab loaded — and bumps the row's {@code version} by one on success. Returns the
	 * number of venue rows changed: {@code 0} means the loaded version no longer matches (another writer
	 * bumped it since the load — the caller, having already verified existence, returns STALE_WRITE);
	 * {@code 1} means the profile was replaced. The amenity set is fully replaced (delete-then-insert),
	 * so it is order-insensitive and drops any amenity no longer selected — and is left untouched when
	 * the version guard rejects the write.
	 */
	int updateVenueProfile(VenueId venueId, long expectedVersion, VenueProfileCommand command);

	/**
	 * The venue's admin profile for the operator console — the editable core plus the
	 * commission + payout currency the owner may read but not write — or empty if no venue has this id
	 * (read-only for the operator; the platform admin changes the rate through
	 * {@link CommissionRateStore}). Read-only; the
	 * caller (application service) has already asserted ownership (invariant #13).
	 */
	Optional<VenueProfileView> findProfile(VenueId venueId);

	/**
	 * Picker summaries for the given venue ids, <strong>ordered by name</strong>. The caller
	 * has already reduced {@code ids} to what the acting operator owns, so this is a plain PK-set
	 * lookup with no authorization of its own — never call it with an unfiltered id set. Missing ids
	 * are simply absent from the result (no exception, no placeholder row). Never called with an empty
	 * collection: the caller short-circuits, so the adapter's {@code IN (:ids)} always has members.
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
