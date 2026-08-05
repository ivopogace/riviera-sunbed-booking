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

	/**
	 * Insert a venue and return its generated id. Also seeds the venue's
	 * {@link CommissionRateStore commission schedule} at the epoch floor with the command's rate
	 * (A7, #348), so the per-service-date rate read is total for the new venue from the start —
	 * the V39 backfill only covers venues that already existed. Without that seed the read would fall
	 * through for every post-V39 venue the first time its rate changed, and answer the new rate for a
	 * day already sold, which is the defect the schedule exists to prevent.
	 */
	long insertVenue(NewVenueCommand command);
	/**
	 * Record that {@code commissionBps} applies to the venue's bookings served on or after
	 * {@code effectiveFrom} (A7, #348) — a civil date in {@code Europe/Tirane} (invariant #6).
	 * Idempotent per {@code (venue, effectiveFrom)}: a second write for the same date overwrites the
	 * rate rather than erroring or duplicating, so two admins acting the same day collapse onto one
	 * row with the last value.
	 *
	 * <p>Only ever called with a date the service computed as <em>tomorrow</em>, never a caller-supplied
	 * one: the schedule is forward-only, so no write can reprice a service date already past
	 * (invariant #9). It does <strong>not</strong> touch {@code venue.commission_bps} — the live rate
	 * the accrual path reads — which is the caller's separate {@link #updateCommission} write.
	 */

	/** Whether a venue with this id exists. */
	boolean venueExists(VenueId venueId);

	/**
	 * Lock the venue row and read its current {@code set_version} optimistic-concurrency token (#226) —
	 * {@code SELECT set_version FROM venue WHERE id = :id FOR UPDATE}. The token is the SEPARATE counter
	 * for the two operator set-position writes (beach-map replace + per-row reprice), distinct from the
	 * profile {@code version} (#224). The caller (having pre-checked existence) compares the returned value
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
	 * Advance the venue's {@code set_version} by one (#226) — {@code UPDATE venue SET set_version =
	 * set_version + 1 WHERE id = :id} — called ONLY after a set-write commits (the layout was replaced /
	 * the row repriced). The caller already holds the venue row lock from {@link #lockAndReadSetVersion},
	 * so this is race-free; a concurrent writer blocked on that lock re-reads the advanced value and gets
	 * STALE_WRITE.
	 */
	void incrementSetVersion(VenueId venueId);

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

	/**
	 * Reprice every set in a row of the venue in one non-destructive {@code UPDATE} (O4, issue #174):
	 * overwrite {@code price_minor}/{@code price_currency} for every {@code set_position} carrying
	 * {@code command.rowLabel()}. Touches no other column, so set identity, pool and any
	 * {@code set_availability} hold survive. Returns the number of set rows changed — {@code 0} means the
	 * venue has no set with that row label, so the caller returns {@code NO_SUCH_ROW}.
	 */
	int repriceRow(VenueId venueId, RowPriceCommand command);

	/**
	 * The ids of every set currently on the venue's map, <strong>without locking</strong> — the
	 * plain read the owner's daily availability view composes with the per-day states (issue #207).
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
	 * Insert every set of a fresh layout for the venue in one unit of work (O3, issue #172). The caller
	 * runs this inside the same {@code @Transactional} boundary as {@link #deleteAllSets}, after having
	 * verified the venue is unclaimed, so the map is never left partially replaced.
	 */
	void insertSets(VenueId venueId, List<SetCommand> sets);

	/**
	 * Replace a venue's editable profile fields in one unit of work (O8 #177; widened from the T7
	 * amenities + distance): name/beach/region/description, booking mode, booking cutoff, the amenity
	 * set, and distance-to-water. Commission and payout currency are read-only and never written. The
	 * write is <strong>conditional on {@code expectedVersion}</strong> — the optimistic-concurrency
	 * token the tab loaded (#224) — and bumps the row's {@code version} by one on success. Returns the
	 * number of venue rows changed: {@code 0} means the loaded version no longer matches (another writer
	 * bumped it since the load — the caller, having already verified existence, returns STALE_WRITE);
	 * {@code 1} means the profile was replaced. The amenity set is fully replaced (delete-then-insert),
	 * so it is order-insensitive and drops any amenity no longer selected — and is left untouched when
	 * the version guard rejects the write.
	 */
	int updateVenueProfile(VenueId venueId, long expectedVersion, VenueProfileCommand command);

	/**
	 * The venue's admin profile for the operator console (O8 #177) — the editable core plus the
	 * read-only commission + payout currency — or empty if no venue has this id. Read-only; the
	 * caller (application service) has already asserted ownership (invariant #13).
	 */
	Optional<VenueProfileView> findProfile(VenueId venueId);

	/**
	 * Picker summaries for the given venue ids, <strong>ordered by name</strong> (S9 #277). The caller
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
