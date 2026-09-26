package ai.riviera.platform.payout.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.ViewVenueChangeRefunds;

/**
 * The admin's venue-caused refunds report: per venue, how many bookings a remodel refunded, what
 * they returned to guests and what the venue paid in fees, built from ledger rows the refund path
 * always writes. Driving adapter on the {@link ViewVenueChangeRefunds} port (invariant #11).
 *
 * <p><strong>{@code ADMIN}-only</strong> ({@code SecurityConfig}; no venue, so no #13 check). A
 * read, so the edge's audit fence writes no row. Rationale: RESPONSIBILITIES.md §payout.
 */
@RestController
@RequestMapping("/api/admin/venue-change-refunds")
class AdminVenueChangeRefundsController {

	private final ViewVenueChangeRefunds refunds;

	AdminVenueChangeRefundsController(ViewVenueChangeRefunds refunds) {
		this.refunds = refunds;
	}

	@GetMapping
	VenueChangeRefundsView perVenue() {
		return VenueChangeRefundsView.of(refunds.perVenue());
	}
}
