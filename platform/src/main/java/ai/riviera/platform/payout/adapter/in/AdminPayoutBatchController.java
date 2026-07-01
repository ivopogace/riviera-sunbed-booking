package ai.riviera.platform.payout.adapter.in;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * Admin endpoints for the weekly BKT payout report (U9, issue #12): generate/read the per-venue batches
 * for an ISO-week period and advance a batch's status. Driving adapter depending only on the payout
 * module's {@link PayoutReport} port (invariant #11).
 *
 * <p><strong>Operator-gated</strong> — venue financial data + money lifecycle, never public.
 * {@code SecurityConfig} matches {@code /api/admin/payout-batches} to role {@code OPERATOR}; the POST/PATCH
 * are token-less and CSRF-exempt like the other operator writes. A malformed {@code period} or
 * {@code status} is a {@code 400}.
 */
@RestController
@RequestMapping("/api/admin/payout-batches")
class AdminPayoutBatchController {

	private final PayoutReport payoutReport;

	AdminPayoutBatchController(PayoutReport payoutReport) {
		this.payoutReport = payoutReport;
	}

	@PostMapping
	List<PayoutBatchView> generate(@RequestParam String period) {
		return payoutReport.generate(PeriodKey.of(period)).stream().map(PayoutBatchView::of).toList();
	}

	@GetMapping
	List<PayoutBatchView> forPeriod(@RequestParam String period) {
		return payoutReport.forPeriod(PeriodKey.of(period)).stream().map(PayoutBatchView::of).toList();
	}

	@PatchMapping("/{id}")
	ResponseEntity<?> mark(@PathVariable long id, @RequestBody UpdateBatchStatusRequest request) {
		BatchStatus target = BatchStatus.valueOf(request.status());
		return switch (payoutReport.mark(id, target)) {
			case BatchStatusOutcome.Marked marked -> ResponseEntity.ok(PayoutBatchView.of(marked.batch()));
			case BatchStatusOutcome.NotFound ignored -> error(HttpStatus.NOT_FOUND, "NO_SUCH_BATCH");
			case BatchStatusOutcome.IllegalTransition it ->
					error(HttpStatus.CONFLICT, "ILLEGAL_TRANSITION " + it.from() + "->" + it.to());
		};
	}

	/** Bad period/status token → 400 (PeriodKey.of / BatchStatus.valueOf throw IllegalArgumentException). */
	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<?> badRequest(IllegalArgumentException ex) {
		return error(HttpStatus.BAD_REQUEST, ex.getMessage());
	}

	private static ResponseEntity<?> error(HttpStatus status, String message) {
		return ResponseEntity.status(status).body(Map.of("error", message));
	}

	/** PATCH body: the target status token ({@code REPORTED} | {@code SETTLED}). */
	record UpdateBatchStatusRequest(String status) {
	}
}
