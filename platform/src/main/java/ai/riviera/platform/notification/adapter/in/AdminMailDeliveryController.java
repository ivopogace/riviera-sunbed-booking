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
 * The platform-admin mail-delivery surface (#380): what happened to a tourist's booking-confirmation
 * mail, and the button that sends it again. Driving adapter depending only on the module's two driving
 * ports.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> Under {@code /api/admin/**}, gated to
 * {@code ADMIN} in {@code SecurityConfig} — platform-wide delivery state belonging to no venue, so it
 * carries the same invariant-#13 exemption as erasure, operator approval, suppression reinstatement and
 * the mail outbox. A plain {@code OPERATOR} or {@code CUSTOMER} is {@code 403}; anonymous is
 * {@code 401}.
 *
 * <p><strong>Lives in the module, not at the composition root</strong> — the
 * {@code AdminEmailSuppressionController} (#391) and {@code AdminMailOutboxController} (#405)
 * precedent, for the same reason: hosting it at the root would force a published
 * {@code notification::api} port for a single same-module consumer.
 *
 * <p><strong>Why the lookup is a {@code POST}.</strong> Its key is an email address, and a query string
 * or path segment would deposit that address in access logs, proxy logs and browser history. A
 * read-shaped {@code POST} is the standard trade for a PII-keyed lookup; the resend's path segment
 * carries the numeric booking id, which is not sensitive.
 *
 * <p><strong>Why every outcome is {@code 200}.</strong> Each is an expected flow an admin acts on
 * rather than an error ({@code riviera-java-conventions} §6) — including "no such booking" and "never
 * confirmed", where the admin needs to know <em>which</em> refusal it was to know what to do next. A
 * malformed request body is the one genuine {@code 400}, and it is RFC-7807 through the single
 * {@link ApiProblem} factory (issue #97); anything thrown becomes a {@link ProblemDetail} through the
 * one {@code ApiErrorHandler}, never a per-controller {@code @ExceptionHandler}.
 *
 * <p><strong>What the responses deliberately never carry</strong> (invariant #7): no arrival code, and
 * no recipient address — the caller supplied the address, and the code is a bearer credential this view
 * has no reason to echo. An unknown address and a known address with no bookings answer identically, so
 * the surface is not an address oracle.
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
