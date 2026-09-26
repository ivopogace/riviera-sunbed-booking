package ai.riviera.platform.venue.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.venue.application.VenueCreationProperties;

/**
 * The operator-facing venue-creation defaults read: {@code GET /api/venue-defaults} serves the
 * platform terms the create path will stamp — currently the default commission rate — straight
 * from {@link VenueCreationProperties}, the bean the stamp reads, so disclosed and stamped rate are
 * one value. Outside the {@code /api/venues/{venueId}} path space (that read binds the segment as a
 * {@code long}); gated to role OPERATOR in {@code SecurityConfig}, with no ownership to assert — no
 * venue exists yet, as for {@code POST /api/venues}.
 */
@RestController
class VenueDefaultsController {

	private final VenueCreationProperties creation;

	VenueDefaultsController(VenueCreationProperties creation) {
		this.creation = creation;
	}

	@GetMapping("/api/venue-defaults")
	VenueDefaultsResponse defaults() {
		return new VenueDefaultsResponse(creation.defaultCommissionBps());
	}

	/** The wire shape: the commission as exact-integer basis points (invariant #5). */
	record VenueDefaultsResponse(int commissionBps) {
	}
}
