package ai.riviera.platform.payout.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.ViewVenueChangeRefunds;

/**
 * The admin's venue-caused refunds report: per venue, how many bookings a remodel refunded, what
 * they returned to guests and what the venue paid in fees. Built from ledger rows the refund path
 * always writes, so resale abuse is visible without anyone maintaining a list. Driving adapter
 * depending only on the module's {@link ViewVenueChangeRefunds} port (invariant #11).
 *
 * <p><strong>Platform-admin gated</strong> — {@code SecurityConfig} matches this path to role
 * {@code ADMIN}. That gate is the whole authorization: the report belongs to no venue, so invariant
 * #13's per-venue ownership check does not apply and the strict role is what keeps one operator from
 * reading a competitor's refund record. A read, so the edge's audit fence writes no row.
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
