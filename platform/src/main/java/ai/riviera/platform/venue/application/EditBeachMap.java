package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for editing a venue's beach-map layout, internal to {@code venue} (REST-only
 * caller). Each method returns a typed outcome the adapter maps to HTTP without exceptions.
 *
 * <p>Every method first verifies the {@link OperatorId} owns {@code venueId} (invariant #13),
 * throwing {@code NotVenueOwnerException} (→ 403). DB UNIQUE constraints are the layout backstop;
 * the methods pre-check so they return a precise {@link SetRejection}.
 */
public interface EditBeachMap {

	/** Place a new set on the venue's map (after asserting {@code operator} owns {@code venueId}). */
	AddSetOutcome addSet(OperatorId operator, VenueId venueId, SetCommand command);

	/**
	 * Re-place a set; price, tier and pool are never refused (invariant #3 is reserve-time). A position
	 * change on a set with a hold dated today or later or a non-terminal booking is refused with
	 * {@link SetRejection#SET_IN_USE} (→ 409), writing nothing. Rationale: RESPONSIBILITIES.md §venue.
	 */
	ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command);

	/**
	 * Remove a set; refused with {@link SetRejection#SET_IN_USE} (→ 409) on a hold dated today or later
	 * or a non-terminal booking. Otherwise {@code Applied}: retired if it carries any booking (ADR-0019),
	 * then {@link SetRejection#NO_SUCH_SET} to every later write; deleted if it carries none.
	 */
	ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId);

	/**
	 * Change price, tier and/or pool on every named set in one transaction, writing only the fields
	 * {@code command} touches; never refused for a claim. Any id not on the venue refuses the whole
	 * batch ({@code NO_SUCH_SET}) before any write; token as {@link #repriceRow} (invariant #3).
	 */
	SetBatchOutcome applyToSets(OperatorId operator, VenueId venueId, long expectedVersion,
			SetBatchCommand command);

	/**
	 * Reprice every set in {@code command.rowLabel()}, allowed despite bookings or holds (charges are
	 * snapshotted). Conditional on {@code expectedVersion} ({@link SetRejection#STALE_WRITE} → 409),
	 * the {@code set_version} token every set-write shares, advanced only on success.
	 */
	ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowPriceCommand command);

	/**
	 * Rename a row (display-only, no claim question); {@link SetRejection#ROW_NAME_TAKEN} (→ 409) if
	 * another row has the label. Token as {@link #repriceRow}, but a same-label rename is a no-op that
	 * does NOT advance it — a caller advancing its own copy of the token must not send one.
	 */
	ChangeOutcome renameRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowNameCommand command);

	/**
	 * Save the whole layout as a diff keyed by grid cell (RESPONSIBILITIES.md §venue); a removed or
	 * repositioned set with a live claim refuses it all as {@link ReplaceLayoutOutcome.SetsInUse},
	 * writing nothing (invariant #2). Token as {@link #repriceRow}: {@link LayoutRejection#STALE_WRITE}.
	 */
	ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId, long expectedVersion,
			LayoutCommand command);
}
