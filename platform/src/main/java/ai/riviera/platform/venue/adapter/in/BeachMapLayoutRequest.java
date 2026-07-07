package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.SetCommand;

/**
 * The request body for the bulk beach-map layout replace ({@code PUT /api/venues/{id}/beach-map}, O3,
 * issue #172): the complete desired grid the operator generated + painted, sent as one write. Each
 * element reuses the single-set {@link SetPositionRequest} shape so the write contract matches the U1
 * read contract exactly — integer minor units + ISO currency (invariant #5), no float. {@link #toCommand()}
 * validates presence per cell (delegating range/token checks to {@link SetCommand}) and wraps the cells
 * in a {@link LayoutCommand}; bad input → {@link IllegalArgumentException} → {@code 400}.
 */
record BeachMapLayoutRequest(List<SetPositionRequest> sets) {

	LayoutCommand toCommand() {
		if (sets == null) {
			throw new IllegalArgumentException("sets is required");
		}
		List<SetCommand> commands = sets.stream().map(SetPositionRequest::toCommand).toList();
		return new LayoutCommand(commands);
	}
}
