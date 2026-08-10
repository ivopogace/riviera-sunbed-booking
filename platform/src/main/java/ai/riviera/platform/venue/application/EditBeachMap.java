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
	 * same value cannot both win (they write overlapping columns) — and the bump precedes the reprice
	 * {@code UPDATE}, so a rejected {@code NO_SUCH_ROW} may still bump it (safe, only makes other tabs
	 * reload; R-2).
	 */
	ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowPriceCommand command);

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
