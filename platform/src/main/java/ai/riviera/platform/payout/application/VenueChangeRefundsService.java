package ai.riviera.platform.payout.application;

import java.util.List;

import org.springframework.stereotype.Service;

/**
 * The venue-caused refunds read use case. A pass-through to the ledger's own aggregate — the
 * grouping and the two separate sums belong in the query, not in a Java fold over every ledger row
 * in the platform. Read-only, so no {@code @Transactional}. Package-private behind
 * {@link ViewVenueChangeRefunds} (invariant #11).
 *
 * <p>No ownership assertion: this surface is platform-wide and role-gated at the edge, which
 * invariant #13 exempts.
 */
@Service
class VenueChangeRefundsService implements ViewVenueChangeRefunds {

	private final PayoutLedger ledger;

	VenueChangeRefundsService(PayoutLedger ledger) {
		this.ledger = ledger;
	}

	@Override
	public List<VenueChangeRefundTotal> perVenue() {
		return ledger.venueChangeTotals();
	}
}
