package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.LayoutRejection;
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
	 * Re-place an existing set (tier, pool, price, coordinates). Price, tier and pool are never
	 * refused: a booking's charge is snapshotted at reserve time, and the pool governs only whether a
	 * <em>new</em> online booking may claim the set (invariant #3 is a reserve-time rule), so a set
	 * switched to walk-in stops selling online from now on while its already-booked dates stay
	 * claimed. Only a position change (row label, position number, grid cell) of a set that carries a
	 * hold dated today or later, or a booking in a non-terminal status, is refused with
	 * {@link SetRejection#SET_IN_USE} (→ 409) and nothing is written — a move would re-seat a guest
	 * who was told this row and number. History does not block an edit — a cancelled or completed
	 * booking pins the row against deletion but strands nobody.
	 */
	ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command);

	/**
	 * Remove a set from the venue's map — refused with {@link SetRejection#SET_IN_USE} (→ 409) if
	 * the set carries an availability hold dated today or later, or a booking in a non-terminal
	 * status: the same claim question {@link #editSet} asks of a move, asked on every removal. A set
	 * that passes it and carries booking history of any status is <strong>retired</strong>, never
	 * deleted (ADR-0019): its row stays for every booking, mail and staff lookup that names it, and
	 * it leaves the map, the calendar, the counts, the daily view and both claim paths for good. A
	 * set with no booking is deleted outright; a hold whose day has passed goes with it, describing
	 * a day that is already gone. Both answer {@code Applied}, and a retired set is
	 * {@link SetRejection#NO_SUCH_SET} to every later write.
	 */
	ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId);

	/**
	 * Change price, tier and/or pool on <strong>every named set</strong> in one transaction — the
	 * set editor's batch apply on a swept selection. After asserting {@code operator} owns
	 * {@code venueId}, it writes only the fields {@code command} touches, leaving each set's own value
	 * for the rest; booked and held sets are included, since none of the three fields is ever refused
	 * for a claim (see {@link #editSet}). Returns {@code Applied(n)} with the number of sets changed,
	 * or {@code Rejected(NO_SUCH_VENUE)}; {@code Rejected(NO_SUCH_SET)} when any id is not a set of
	 * this venue — the whole batch is refused before any write, so the count never overstates.
	 *
	 * <p>Optimistic concurrency: identical to {@link #repriceRow} — the same {@code set_version}
	 * token, {@link SetRejection#STALE_WRITE} (→ 409) on a mismatch, advanced once on success only.
	 * Lock order: the venue row, then the named set rows {@code FOR UPDATE}, so a racing claim's pool
	 * read waits for the write to commit and decides against the committed pool (invariant #3).
	 */
	SetBatchOutcome applyToSets(OperatorId operator, VenueId venueId, long expectedVersion,
			SetBatchCommand command);

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
	 * Save the venue's <strong>whole</strong> beach-map layout in one transaction — the generate-grid
	 * + paint editor's bulk write — as a <em>diff keyed by grid cell</em> against the stored active map.
	 * After asserting {@code operator} owns {@code venueId}: a stored set whose cell the submission still
	 * names is updated in place under its own id (row label, tier, pool and price — never refused;
	 * the position number too, but that is a reposition), a cell no stored set occupies is inserted,
	 * and a stored set whose cell is absent is removed — retired when it carries any booking, deleted
	 * otherwise (ADR-0019). Only the removed and the repositioned sets ask the claim question: if any
	 * of them has a hold dated today or later or a booking that can still be honoured, the whole save
	 * is refused as {@link ReplaceLayoutOutcome.SetsInUse} naming every such set, and nothing is
	 * written (invariant #2). A hold whose day has gone does not block. A set that changes cell
	 * reaches the save as a removal plus an insert — the body carries no ids, so the cell is the
	 * identity. Row names may swap or rotate among kept sets in one save.
	 *
	 * <p>Refused with {@link LayoutRejection#ROW_NAME_TAKEN} (→ 409) when one submitted
	 * {@code rowLabel} appears under two distinct grid rows — {@link #renameRow}'s one-label-one-row
	 * rule checked within the batch, which no DB constraint can see (gap-cell numbering keeps every
	 * {@code (row_label, position_no)} pair unique).
	 *
	 * <p>Optimistic concurrency: the caller passes the {@code expectedVersion} (the venue's
	 * {@code set_version}) the tab loaded with the map; the write is conditional on it. Another writer having
	 * bumped it since the load yields {@link LayoutRejection#STALE_WRITE} (→ 409), so a stale layout tab
	 * cannot silently clobber the map. The token is advanced <strong>only</strong> once the save has
	 * succeeded — on every successful save, an unchanged layout included — so a refusal leaves it
	 * untouched and the acting tab's own retry off the same value still works; it is the SAME token as
	 * {@link #repriceRow}, so a save and a reprice racing off the same value cannot both win.
	 */
	ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId, long expectedVersion,
			LayoutCommand command);
}
