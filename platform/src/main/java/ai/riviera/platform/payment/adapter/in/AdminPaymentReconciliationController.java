package ai.riviera.platform.payment.adapter.in;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payment.application.PaymentReconciliation;
import ai.riviera.platform.payment.application.ReconciliationReport;
import ai.riviera.platform.payment.application.RepairOutcome;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.shared.ApiProblem;

/**
 * ADMIN surface over {@link PaymentReconciliation}: read what differs from the provider now, then settle one payment
 * from the provider's fresh answer. Role-gated under {@code /api/admin/**} (invariant #13's exemption) and not
 * profile-bound, so the admin role gate's discovery reaches it. Ids only (invariant #7); every outcome but an unknown
 * payment is {@code 200}. Runbook: {@code docs/runbooks/payment-reconciliation.md}.
 */
@RestController
@RequestMapping("/api/admin/payment-reconciliation")
class AdminPaymentReconciliationController {

	private static final String CODE_UNKNOWN_PAYMENT = "UNKNOWN_PAYMENT";

	private final PaymentReconciliation reconciliation;

	AdminPaymentReconciliationController(PaymentReconciliation reconciliation) {
		this.reconciliation = reconciliation;
	}

	record DivergenceResponse(String kind, long paymentId, String reference, long payeeVenueId, List<Long> bookingIds) {
	}

	record UncheckedResponse(long paymentId, String reference, String reason) {
	}

	record ReconciliationResponse(List<DivergenceResponse> divergences, List<String> orphans,
			List<UncheckedResponse> unchecked, String orphanListing) {
	}

	record RepairResponse(String outcome) {
	}

	@GetMapping
	ReconciliationResponse report() {
		ReconciliationReport report = reconciliation.report();
		return new ReconciliationResponse(
				report.divergences().stream()
						.map(divergence -> new DivergenceResponse(divergence.kind().name(), divergence.paymentId(),
								divergence.reference(), divergence.payee().value(),
								divergence.bookings().stream().map(BookingRef::value).toList()))
						.toList(),
				report.orphans(),
				report.unchecked().stream()
						.map(row -> new UncheckedResponse(row.paymentId(), row.reference(), row.reason()))
						.toList(),
				report.orphanListing().name());
	}

	@PostMapping("/{paymentId}/repair")
	ResponseEntity<?> repair(@PathVariable long paymentId) {
		RepairOutcome outcome = reconciliation.repair(paymentId);
		if (outcome == RepairOutcome.UNKNOWN_PAYMENT) {
			return ApiProblem.response(HttpStatus.NOT_FOUND, CODE_UNKNOWN_PAYMENT, "No such payment.");
		}
		return ResponseEntity.ok(new RepairResponse(outcome.name()));
	}
}
