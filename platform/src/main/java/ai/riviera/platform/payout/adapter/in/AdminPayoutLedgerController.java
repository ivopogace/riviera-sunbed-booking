package ai.riviera.platform.payout.adapter.in;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payout.application.ViewPayoutLedger;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Operator-gated read of a venue's payout ledger (U9, issue #12): accruals + reversals with the
 * running net owed (invariant #9). Driving adapter depending on the payout module's
 * {@link ViewPayoutLedger} port (invariant #11) plus the edge {@link CurrentOperator} resolver.
 *
 * <p><strong>Operator-gated + per-venue scoped</strong> — the ledger is venue financial data, not
 * public. {@code SecurityConfig} matches the payout-ledger GET to role {@code OPERATOR}
 * <em>before</em> the public venue GET (unauthenticated → {@code 401}); the service then asserts the
 * authenticated operator owns {@code venueId} (invariant #13), a mismatch being {@code 403}.
 */
@RestController
@RequestMapping("/api/venues")
class AdminPayoutLedgerController {

	private final ViewPayoutLedger viewPayoutLedger;
	private final CurrentOperator currentOperator;

	AdminPayoutLedgerController(ViewPayoutLedger viewPayoutLedger, CurrentOperator currentOperator) {
		this.viewPayoutLedger = viewPayoutLedger;
		this.currentOperator = currentOperator;
	}

	@GetMapping("/{venueId}/payout-ledger")
	PayoutLedgerView ledger(Authentication authentication, @PathVariable long venueId) {
		OperatorId operator = currentOperator.require(authentication);
		return PayoutLedgerView.of(viewPayoutLedger.forVenue(operator, new VenueId(venueId)));
	}
}
