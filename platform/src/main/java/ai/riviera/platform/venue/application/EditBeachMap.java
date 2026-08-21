package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for editing a venue's beach-map layout (U7) — incremental per-set
 * CRUD. Internal to the {@code venue} module (REST-only caller), so it lives in
 * {@code application}, not {@code api/} (invariant #11). One purposeful conversation:
 * place, re-place, and remove a set position; each method returns a typed outcome so the
 * adapter maps it to HTTP without exceptions for expected flows.
 *
 * <p>Every method is venue-scoped and takes the authenticated {@link OperatorId} as its first
 * argument: the implementation verifies the operator owns {@code venueId} before any read/write
 * (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. Layout
 * integrity (one set per cell / per position) is guarded by the DB UNIQUE constraints (V2/V12) as
 * the hard backstop; these methods pre-check to return a precise {@link SetRejection} rather than
 * surfacing a raw constraint violation.
 */
public interface EditBeachMap {

	/** Place a new set on the venue's map (after asserting {@code operator} owns {@code venueId}). */
	AddSetOutcome addSet(OperatorId operator, VenueId venueId, SetCommand command);

	/**
	 * Re-place an existing set (tier, pool, price, coordinates) — the pool split is editable, but
	 * not while someone is still owed the spot. If the command would change the pool or the
	 * position (row label, position number, grid cell) of a set that carries a hold dated today or
	 * later, or a booking in a non-terminal status, the edit is refused with
	 * {@link SetRejection#SET_IN_USE} (→ 409) and nothing is written — otherwise a repool would
	 * strand an online booking on walk-in inventory (invariant #3) and a move would re-seat a
	 * guest who was told this row and number. Price and tier are never refused: a booking's charge
	 * is snapshotted at reserve time, the same reason {@link #repriceRow} is allowed on a claimed
	 * venue. History does not block an edit — a cancelled or completed booking pins the row
	 * against deletion but strands nobody.
	 */
	ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command);

	/**
	 * Remove a set from the venue's map — refused with {@link SetRejection#SET_IN_USE} (→ 409) if
	 * the set carries an availability hold dated today or later, or a booking of any status
	 * including terminal history. It asks {@link #editSet}'s availability question but a stricter
	 * booking one, and asks it on every delete rather than only on a repool or reposition: the
	 * RESTRICT {@code booking.set_id} FK refuses such a delete outright, so the guard turns what
	 * would surface as a server error into the honest conflict. A hold whose day has passed does
	 * not block — it CASCADEs away with the set, describing a day that is already gone.
	 */
	ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId);

	/**
	 * Reprice <strong>every set in a row</strong> — the operator console's Pricing tab.
	 * After asserting {@code operator} owns {@code venueId}, it applies {@code command}'s full-day price
	 * to every set carrying {@code command.rowLabel()} in one non-destructive {@code UPDATE}: set identity,
	 * pool, coordinates and any {@code set_availability} hold are untouched, so — unlike
	 * {@link #replaceLayout} — repricing is allowed even when the venue has bookings or holds (a booking's
	 * charge was snapshotted at reserve time, so a reprice never alters it). Returns {@code Applied}, or
	 * {@code Rejected(NO_SUCH_VENUE)} / {@code Rejected(NO_SUCH_ROW)} when the venue or the row is unknown.
	 *
	 * <p>Optimistic concurrency: the caller passes the {@code expectedVersion} (the venue's
	 * {@code set_version}) the tab loaded with the map; the write is conditional on it. Another writer
	 * having bumped it since the load yields {@link SetRejection#STALE_WRITE} (→ 409). It bumps the
	 * <strong>same</strong> token {@link #replaceLayout} does — so a replace and a reprice racing off the
	 * same value cannot both win (they write overlapping columns) — and the bump follows a successful
	 * reprice, so a rejected {@code NO_SUCH_ROW} leaves the token untouched and the acting tab's own
	 * retry off the same value still works.
	 */
	ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowPriceCommand command);

	/**
	 * Rename <strong>every set in a row</strong> — a display-only write, the {@link #repriceRow}
	 * analogue for the row's label. After asserting {@code operator} owns {@code venueId}, it writes
	 * {@code command.newLabel()} over {@code row_label} for every set carrying
	 * {@code command.rowLabel()} in one non-destructive {@code UPDATE}: set identity, pool,
	 * coordinates, price and any {@code set_availability} hold are untouched, so — unlike
	 * {@link #replaceLayout} and {@link #editSet} — a rename is allowed on a venue with bookings or
	 * holds and asks no claim question at all. Nothing a claim depends on changes, so nothing can be
	 * stranded or re-seated; the guest keeps the same set, at the same row position, and reads the
	 * new name live.
	 *
	 * <p>Refused with {@link SetRejection#ROW_NAME_TAKEN} (→ 409) when another row already carries
	 * the requested label — the database alone would not catch it unless the two rows' position
	 * numbers also collided, and a shared label merges two physical rows wherever sets are grouped
	 * by it. A rename to the row's current label is a permitted no-op. Returns
	 * {@code Rejected(NO_SUCH_VENUE)} / {@code Rejected(NO_SUCH_ROW)} when the venue or the row is
	 * unknown.
	 *
	 * <p>Optimistic concurrency: identical to {@link #repriceRow} — the caller passes the
	 * {@code set_version} the tab loaded, the write is conditional on it, a mismatch yields
	 * {@link SetRejection#STALE_WRITE} (→ 409), and the token is advanced only after a rename that
	 * actually wrote — so a rejected one, <em>and the same-label no-op</em>, both leave the acting
	 * tab's own retry valid. A caller that optimistically advances its own copy of the token must
	 * therefore not send a same-label rename, or it will run one ahead of the server.
	 */
	ChangeOutcome renameRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowNameCommand command);

	/**
	 * Replace the venue's <strong>whole</strong> beach-map layout in one transaction —
	 * the generate-grid + paint editor's bulk write. After asserting {@code operator} owns {@code venueId},
	 * it is <em>reject-unless-unclaimed</em>: if any of the venue's existing sets has a booking (any status)
	 * or an availability hold dated today or later, the replace is refused
	 * ({@link ReplaceRejection#LAYOUT_IN_USE}) and nothing is deleted — so no claimed set is dropped and
	 * invariants #2/#3 hold. A hold whose day has gone does not block: it describes a day already past and
	 * goes with its set. On a clear venue the existing sets are deleted and {@code command}'s grid inserted
	 * atomically.
	 *
	 * <p>Optimistic concurrency: the caller passes the {@code expectedVersion} (the venue's
	 * {@code set_version}) the tab loaded with the map; the write is conditional on it. Another writer having
	 * bumped it since the load yields {@link ReplaceRejection#STALE_WRITE} (→ 409), so a stale layout tab
	 * cannot silently clobber the map. The token is advanced <strong>only</strong> once the replace has
	 * succeeded, so a rejected one leaves it untouched and the acting tab's own retry off the same value
	 * still works; it is the SAME token as {@link #repriceRow}, so a replace and a reprice racing off the
	 * same value cannot both win.
	 */
	ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId, long expectedVersion,
			LayoutCommand command);
}
