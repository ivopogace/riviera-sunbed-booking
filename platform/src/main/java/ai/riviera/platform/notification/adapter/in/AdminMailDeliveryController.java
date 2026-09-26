package ai.riviera.platform.notification.adapter.in;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationResend;
import ai.riviera.platform.notification.application.MailAttempt;
import ai.riviera.platform.notification.application.MailDeliveryBooking;
import ai.riviera.platform.notification.application.MailDeliveryLookup;
import ai.riviera.platform.shared.ApiProblem;

/**
 * ADMIN booking-confirmation delivery lookup and resend. Under {@code /api/admin/**} — ADMIN-gated in
 * {@code SecurityConfig}, exempt from invariant #13, and every mutating call audited by the edge. The
 * lookup is a {@code POST} so the address never lands in URLs or logs. Every outcome is {@code 200}; a
 * malformed body is an RFC-7807 {@code 400} via {@link ApiProblem}, anything thrown a
 * {@link ProblemDetail} via {@code ApiErrorHandler}. Responses never carry the booking code (#7) or the
 * address, and an unknown address answers like one with no bookings — no address oracle.
 */
@RestController
@RequestMapping("/api/admin/mail-deliveries")
class AdminMailDeliveryController {

	private final MailDeliveryLookup lookup;
	private final BookingConfirmationResend resend;

	AdminMailDeliveryController(MailDeliveryLookup lookup, BookingConfirmationResend resend) {
		this.lookup = lookup;
		this.resend = resend;
	}

	/** Wire DTO: the raw address, canonicalised downstream by {@code customer}'s own rule. */
	record LookupRequest(String email) {
	}

	/**
	 * One attempt in a booking's history.
	 *
	 * @param source {@code AUTOMATIC} | {@code ADMIN_RESEND}
	 * @param outcome {@code SENT} | {@code WITHHELD_SUPPRESSED} | {@code TRANSPORT_FAILED} |
	 *        {@code ABANDONED_MISSING_FACTS}
	 */
	record MailAttemptResponse(String source, String outcome, Instant attemptedAt) {
	}

	/**
	 * One booking and its mail history.
	 *
	 * @param everConfirmed whether a confirmation was ever due — what makes an empty {@code attempts}
	 *        list readable rather than ambiguous
	 */
	record MailDeliveryBookingResponse(long bookingId, String venueName, LocalDate bookingDate,
			boolean everConfirmed, List<MailAttemptResponse> attempts) {
	}

	/** The lookup result; empty for an unknown address and for a known one with no bookings alike. */
	record MailDeliveryLookupResponse(List<MailDeliveryBookingResponse> bookings) {
	}

	/**
	 * The result of a press.
	 *
	 * @param outcome {@code SENT} | {@code WITHHELD_SUPPRESSED} | {@code TRANSPORT_FAILED} |
	 *        {@code NO_SUCH_BOOKING} | {@code NOT_CONFIRMED} | {@code MISSING_FACTS}
	 */
	record MailResendResponse(String outcome) {
	}

	@PostMapping("/lookup")
	ResponseEntity<?> lookup(@RequestBody LookupRequest request) {
		if (!AddressShape.isAddressShaped(request.email())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "An email address is required.");
		}
		return ResponseEntity.ok(new MailDeliveryLookupResponse(
				lookup.forEmail(request.email()).stream().map(AdminMailDeliveryController::view).toList()));
	}

	@PostMapping("/{bookingId}/resend")
	MailResendResponse resend(@PathVariable long bookingId) {
		return new MailResendResponse(resend.resend(new BookingId(bookingId)).name());
	}

	private static MailDeliveryBookingResponse view(MailDeliveryBooking booking) {
		return new MailDeliveryBookingResponse(booking.bookingId().value(), booking.venueName(),
				booking.bookingDate(), booking.everConfirmed(),
				booking.attempts().stream().map(AdminMailDeliveryController::view).toList());
	}

	private static MailAttemptResponse view(MailAttempt attempt) {
		return new MailAttemptResponse(attempt.source().name(), attempt.outcome().name(),
				attempt.attemptedAt());
	}
}
