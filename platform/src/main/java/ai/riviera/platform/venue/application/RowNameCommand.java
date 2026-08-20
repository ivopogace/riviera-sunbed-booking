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
 *
 * <p>Both labels are <strong>stripped</strong> before validation. Surrounding whitespace does not
 * survive into storage, so {@code " Back row"} cannot slip past the duplicate-label refusal by
 * differing from the {@code "Back row"} it renders identically to. Case is deliberately left alone:
 * {@code "back row"} and {@code "Back row"} read differently on the map, so they are two names, not
 * one name written twice.
 */
public record RowNameCommand(String rowLabel, String newLabel) {

	public RowNameCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		newLabel = VenueFieldValidation.strip(newLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		VenueFieldValidation.requireText(newLabel, "newLabel", VenueFieldValidation.MAX_ROW_LABEL_LENGTH);
	}
}
