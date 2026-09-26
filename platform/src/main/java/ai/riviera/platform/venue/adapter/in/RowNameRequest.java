package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.RowNameCommand;

/**
 * The request body for renaming a beach-map row ({@code PUT /api/venues/{id}/rows/{rowLabel}/name}).
 * The row rides the URL path, so {@link #toCommand(String)} folds it in; {@link RowNameCommand}
 * validates presence/length (bad input → {@link IllegalArgumentException} → {@code 400
 * INVALID_REQUEST}, §6b). {@code expectedVersion} is the required {@code setVersion} token, a
 * {@link Long} so an absent field is a 400 ({@link ExpectedVersion#require(Long)}), never a silent
 * 0 matching a fresh venue.
 */
record RowNameRequest(String newLabel, Long expectedVersion) {

	RowNameCommand toCommand(String rowLabel) {
		return new RowNameCommand(rowLabel, newLabel);
	}
}
