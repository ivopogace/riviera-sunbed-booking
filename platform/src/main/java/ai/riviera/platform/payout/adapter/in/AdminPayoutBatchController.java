package ai.riviera.platform.payout.adapter.in;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * Admin endpoints for the weekly BKT payout report (U9, issue #12): generate/read the per-venue batches
 * for an ISO-week period and advance a batch's status. Driving adapter depending only on the payout
 * module's {@link PayoutReport} port (invariant #11).
 *
 * <p><strong>Platform-admin gated</strong> — {@code SecurityConfig} matches
 * {@code /api/admin/payout-batches} (and the item path) to role {@code ADMIN}, tightened from
 * {@code OPERATOR} by #348 A4. That gate is the <em>whole</em> authorization: nothing here is venue-scoped,
 * because nothing here belongs to one venue — the GET reports every venue's gross/commission/net for the
 * period and the PATCH addresses a batch by id. Invariant #13 exempts {@code /api/admin/**} from per-venue
 * ownership (an admin does not <em>own</em> a payout run), which is exactly why the role must be the
 * strict one: under {@code OPERATOR} any approved operator in this multi-tenant marketplace could read
 * competitors' payout figures and mark their batches settled. The POST/PATCH are session writes and
 * require a CSRF token like every other non-exempt write. A malformed {@code period} or {@code status} is
 * a {@code 400 INVALID_REQUEST} via {@code ApiErrorHandler}; errors are RFC-7807 {@link ProblemDetail}
 * built by {@link ApiProblem} (issue #97).
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
		return payoutReport.generate(parsePeriod(period)).stream().map(PayoutBatchView::of).toList();
	}

	@GetMapping
	List<PayoutBatchView> forPeriod(@RequestParam String period) {
		return payoutReport.forPeriod(parsePeriod(period)).stream().map(PayoutBatchView::of).toList();
	}

	@PatchMapping("/{id}")
	ResponseEntity<?> mark(@PathVariable long id, @RequestBody UpdateBatchStatusRequest request) {
		BatchStatus target = InvalidApiRequestException.parsing(() -> BatchStatus.valueOf(request.status()));
		return switch (payoutReport.mark(id, target)) {
			case BatchStatusOutcome.Marked marked -> ResponseEntity.ok(PayoutBatchView.of(marked.batch()));
			case BatchStatusOutcome.NotFound ignored -> ApiProblem.response(HttpStatus.NOT_FOUND,
					"NO_SUCH_BATCH", "No such payout batch.");
			// The code is stable; the offending from→to pair belongs in the human-readable detail.
			case BatchStatusOutcome.IllegalTransition it -> ApiProblem.response(HttpStatus.CONFLICT,
					"ILLEGAL_TRANSITION", it.from() + " to " + it.to() + " is not a legal transition.");
		};
	}


	/** A malformed period token is a 400, while {@link PeriodKey}'s guard stays a 500 off the edge (#118). */
	private static PeriodKey parsePeriod(String period) {
		return InvalidApiRequestException.parsing(() -> PeriodKey.of(period));
	}

	/** PATCH body: the target status token ({@code REPORTED} | {@code SETTLED}). */
	record UpdateBatchStatusRequest(String status) {
	}
}
