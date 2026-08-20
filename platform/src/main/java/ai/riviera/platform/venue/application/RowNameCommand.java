package ai.riviera.platform.venue.application;

/**
 * The validated intent to rename one beach-map <strong>row</strong> — the display label every set
 * carrying {@code rowLabel} reads on the tourist map's price rail, in booking views and in
 * confirmation mail. The editing grain is the row, matching {@link RowPriceCommand}: the fan-out to
 * the row's sets is a single non-destructive {@code UPDATE} in {@link Venues#renameRow}.
 *
 * <p>Its compact constructor enforces the bound {@code set_position_row_label_check} also enforces
 * in the database — {@code newLabel} is at most {@link VenueFieldValidation#MAX_ROW_LABEL_LENGTH}
 * code points — so an overlong rename is rejected at the boundary
 * ({@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}, §6b) rather than surfacing a raw
 * constraint violation. {@code rowLabel} names the row to rename and is required but unbounded: it
 * has to match a stored label, which is already within the bound, so a longer one simply finds no
 * row.
 */
public record RowNameCommand(String rowLabel, String newLabel) {

	public RowNameCommand {
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		VenueFieldValidation.requireText(newLabel, "newLabel", VenueFieldValidation.MAX_ROW_LABEL_LENGTH);
	}
}
