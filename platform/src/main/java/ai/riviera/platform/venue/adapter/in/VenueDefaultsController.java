package ai.riviera.platform.venue.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.venue.application.VenueCreationProperties;

/**
 * The operator-facing venue-creation defaults read (issue #692): {@code GET /api/venue-defaults}
 * serves the platform terms the create path will stamp — currently the default commission rate —
 * straight from {@link VenueCreationProperties}, the same bean the stamp reads, so the disclosed
 * figure and the stamped rate are one value by construction. Deliberately outside the
 * {@code /api/venues/{venueId}} path space (that read binds the segment as a {@code long}) and
 * gated to role OPERATOR in {@code SecurityConfig}; there is no ownership to assert — no venue
 * exists yet, the same posture as {@code POST /api/venues} itself.
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
