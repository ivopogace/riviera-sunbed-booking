package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.SetCommand;

/**
 * The request body for the bulk beach-map layout replace ({@code PUT /api/venues/{id}/beach-map}):
 * the complete desired grid as one write, each cell a {@link SetPositionRequest} (integer minor
 * units + ISO currency, invariant #5). {@link #toCommand()} checks presence per cell (range/token
 * checks in {@link SetCommand}); bad input → {@link IllegalArgumentException} → 400.
 * {@code expectedVersion} is the required {@code setVersion} token, a {@link Long} so an absent
 * field is a 400 ({@link ExpectedVersion#require(Long)}), never a silent 0 matching a fresh venue.
 */
record BeachMapLayoutRequest(List<SetPositionRequest> sets, Long expectedVersion) {

	LayoutCommand toCommand() {
		if (sets == null) {
			throw new IllegalArgumentException("sets is required");
		}
		List<SetCommand> commands = sets.stream().map(SetPositionRequest::toCommand).toList();
		return new LayoutCommand(commands);
	}
}
