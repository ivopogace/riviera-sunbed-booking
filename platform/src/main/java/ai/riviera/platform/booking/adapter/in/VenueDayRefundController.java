package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.booking.application.refund.RefundVenueDay;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator's venue day refund (ADR-0027): {@code POST /api/venues/{venueId}/bookings/{code}/day-refund?date=}
 * refunds that guest's that day through the {@link RefundVenueDay} port (#11), the amount server-decided
 * (#10). {@code date} is required: an implicit today could refund the wrong day. The code travels in the
 * path as check-in's does (ADR-0006) and never comes back in a body (invariant #7). Operator-gated: {@code SecurityConfig} matches this POST to {@code OPERATOR}
 * before the public venue rules; ownership is the service's (#13).
 */
@RestController
@RequestMapping("/api/venues")
class VenueDayRefundController {

	private final RefundVenueDay refundVenueDay;
	private final OperatorDirectory operatorDirectory;

	VenueDayRefundController(RefundVenueDay refundVenueDay, OperatorDirectory operatorDirectory) {
		this.refundVenueDay = refundVenueDay;
		this.operatorDirectory = operatorDirectory;
	}

	@PostMapping("/{venueId}/bookings/{code}/day-refund")
	ResponseEntity<?> refund(Authentication authentication, @PathVariable long venueId, @PathVariable String code,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		return VenueDayRefundResponses.of(refundVenueDay.refundDay(operator, new VenueId(venueId), code, date), date);
	}
}
