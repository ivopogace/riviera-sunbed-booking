package ai.riviera.platform.payout.infrastructure.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.in.ViewPayoutLedger;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Operator-gated read of a venue's payout ledger (U9, issue #12): accruals + reversals with the
 * running net owed (invariant #9). Driving adapter depending only on the payout module's
 * {@link ViewPayoutLedger} port (invariant #11).
 *
 * <p><strong>Operator-gated</strong> — the ledger is venue financial data, not public.
 * {@code SecurityConfig} matches the payout-ledger GET to role {@code OPERATOR} <em>before</em> the
 * public venue GET; an unauthenticated call is {@code 401}.
 */
@RestController
@RequestMapping("/api/venues")
class AdminPayoutLedgerController {

	private final ViewPayoutLedger viewPayoutLedger;

	AdminPayoutLedgerController(ViewPayoutLedger viewPayoutLedger) {
		this.viewPayoutLedger = viewPayoutLedger;
	}

	@GetMapping("/{venueId}/payout-ledger")
	PayoutLedgerView ledger(@PathVariable long venueId) {
		return PayoutLedgerView.of(viewPayoutLedger.forVenue(new VenueId(venueId)));
	}
}
