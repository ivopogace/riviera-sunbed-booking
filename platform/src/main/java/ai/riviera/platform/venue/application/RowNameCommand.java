package ai.riviera.platform.venue.application;

/**
 * The validated intent to rename one beach-map row: every set carrying {@code rowLabel} takes
 * {@code newLabel} in one non-destructive {@code UPDATE} ({@link Venues#renameRow}). Both labels
 * are stripped first, so {@code " Back row"} cannot dodge the duplicate-label refusal; case is kept,
 * as {@code "back row"} and {@code "Back row"} read as two names. {@code newLabel} is capped at
 * {@link VenueFieldValidation#MAX_ROW_LABEL_LENGTH} code points, the DB CHECK's twin, so an overlong
 * one is a {@code 400}; {@code rowLabel} is required but unbounded, as a longer one matches no row.
 */
public record RowNameCommand(String rowLabel, String newLabel) {

	public RowNameCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		newLabel = VenueFieldValidation.strip(newLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		VenueFieldValidation.requireText(newLabel, "newLabel", VenueFieldValidation.MAX_ROW_LABEL_LENGTH);
	}
}
