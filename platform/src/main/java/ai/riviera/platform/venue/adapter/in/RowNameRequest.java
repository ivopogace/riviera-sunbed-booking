package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.RowNameCommand;

/**
 * The request body for renaming a beach-map row ({@code PUT /api/venues/{id}/rows/{rowLabel}/name}).
 * The row being renamed rides the URL path, so {@link #toCommand(String)} folds it in and the body
 * carries only what changes; {@link RowNameCommand} does the presence/length validation (bad input →
 * {@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}, §6b).
 *
 * <p>{@code expectedVersion} is the required optimistic-concurrency token — the {@code setVersion}
 * the tab loaded with the map read. It is typed {@link Long} (not primitive) so an absent field is
 * {@code null}, not a silent {@code 0}: {@link ExpectedVersion#require(Long)} rejects the null with a
 * {@code 400} rather than letting it match a fresh venue (mirrors {@code RowPriceRequest}).
 */
record RowNameRequest(String newLabel, Long expectedVersion) {

	RowNameCommand toCommand(String rowLabel) {
		return new RowNameCommand(rowLabel, newLabel);
	}
}
