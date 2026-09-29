package ai.riviera.platform.booking.adapter.in;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.refund.GuestBooking;
import ai.riviera.platform.booking.application.refund.GuestBookingDay;
import ai.riviera.platform.booking.application.refund.GuestDayRefundLookup;
import ai.riviera.platform.booking.application.refund.RefundVenueDay;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;

/**
 * The admin's venue day refund (ADR-0027 decision 1) under {@code /api/admin/bookings}: ADMIN-gated in
 * {@code SecurityConfig}, exempt from invariant #13 (the venue is the booking row's), every call audited by
 * the edge with the optional {@code X-Audit-Reason}. The lookup is a {@code POST} so the address never lands
 * in a URL or the audit path; the refund is keyed on the booking id and the date, never a code (#7), and
 * answers exactly as the operator's entry does ({@link VenueDayRefundResponses}).
 */
@RestController
@RequestMapping("/api/admin/bookings")
class AdminDayRefundController {

	/** The problem {@code instance} for the refund: a constant, never a value from the request (#7). */
	private static final URI REFUND_INSTANCE = URI.create("/api/admin/bookings");

	private final GuestDayRefundLookup lookup;
	private final RefundVenueDay refundVenueDay;
	private final CurrentOperator currentOperator;

	AdminDayRefundController(GuestDayRefundLookup lookup, RefundVenueDay refundVenueDay,
			CurrentOperator currentOperator) {
		this.lookup = lookup;
		this.refundVenueDay = refundVenueDay;
		this.currentOperator = currentOperator;
	}

	/** Wire DTO: the raw address, canonicalised downstream by {@code customer}'s own rule. */
	record LookupRequest(String email) {
	}

	/** One service day: {@code state} is {@code OPEN} | {@code ATTENDED} | {@code REFUNDED} | {@code RELEASED}. */
	record GuestBookingDayResponse(LocalDate date, String state) {
	}

	/**
	 * One booking the admin may act on: {@code refundable} iff it is {@code CONFIRMED}, {@code COMPLETED} or
	 * {@code NO_SHOW} (a day refund's precondition; a cancelled one has nothing left); {@code status} is the
	 * lifecycle token; dates are {@code Europe/Tirane} civil days (#6). Never the code (#7).
	 */
	record GuestBookingResponse(long bookingId, String venueName, LocalDate firstDate, LocalDate lastDate,
			String status, boolean refundable, List<GuestBookingDayResponse> days) {
	}

	/** The lookup result; empty for an unknown address and for a known one with no bookings alike. */
	record GuestBookingLookupResponse(List<GuestBookingResponse> bookings) {
	}

	@PostMapping("/lookup")
	ResponseEntity<?> lookup(@RequestBody LookupRequest request) {
		if (!isAddressShaped(request.email())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "An email address is required.");
		}
		return ResponseEntity.ok(new GuestBookingLookupResponse(
				lookup.forEmail(request.email()).stream().map(AdminDayRefundController::view).toList()));
	}

	@PostMapping("/{bookingId}/days/{date}/refund")
	ResponseEntity<?> refund(Authentication authentication, @PathVariable long bookingId,
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return VenueDayRefundResponses.of(
				refundVenueDay.refundDayAsAdmin(currentOperator.require(authentication), new BookingId(bookingId), date),
				date, REFUND_INSTANCE);
	}

	/** A non-empty local part, an {@code @} and a non-empty domain: a shapeless value would hide a typo behind an empty list. */
	private static boolean isAddressShaped(String email) {
		if (email == null || email.isBlank()) {
			return false;
		}
		int at = email.trim().lastIndexOf('@');
		return at > 0 && at < email.trim().length() - 1;
	}

	private static GuestBookingResponse view(GuestBooking booking) {
		return new GuestBookingResponse(booking.bookingId().value(), booking.venueName(), booking.firstDate(),
				booking.lastDate(), booking.status().name(), booking.status().stormDayRefundable(),
				booking.days().stream().map(AdminDayRefundController::view).toList());
	}

	private static GuestBookingDayResponse view(GuestBookingDay day) {
		return new GuestBookingDayResponse(day.date(), day.state().name());
	}
}
