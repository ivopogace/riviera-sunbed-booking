package ai.riviera.platform.booking.adapter.in;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.view.ViewBooking;

/**
 * Public tourist booking endpoint (U3, issue #6). Driving adapter — depends only on the
 * {@code booking} module's {@link CreateBooking} port (invariant #11). Maps the sealed
 * {@link BookingOutcome} to HTTP via an exhaustive {@code switch}: {@code Confirmed}→201,
 * {@code SET_TAKEN}→409, {@code NOT_ONLINE_POOL}/{@code BOOKING_CLOSED}→422,
 * {@code NO_SUCH_SET}→404; malformed input→400.
 */
@RestController
@RequestMapping("/api/bookings")
class BookingController {

	private final CreateBooking createBooking;
	private final ViewBooking viewBooking;
	private final CancelBooking cancelBooking;

	BookingController(CreateBooking createBooking, ViewBooking viewBooking, CancelBooking cancelBooking) {
		this.createBooking = createBooking;
		this.viewBooking = viewBooking;
		this.cancelBooking = cancelBooking;
	}

	/**
	 * View a booking by its code (U6). The code is the bearer credential (invariant #7) — knowing it
	 * authorizes the view; it is never logged. Returns the summary + server-computed refund terms, or
	 * {@code 404} for an unknown code. (#50 builds on this endpoint.)
	 */
	@GetMapping("/{code}")
	ResponseEntity<?> view(@PathVariable String code) {
		return viewBooking.byCode(code)
				.<ResponseEntity<?>>map(detail -> ResponseEntity.ok(BookingDetailView.of(detail)))
				.orElseGet(() -> error(HttpStatus.NOT_FOUND, "NO_SUCH_BOOKING"));
	}

	/**
	 * Cancel a booking by its code (U6). The refund is computed server-side (invariant #10) — no
	 * request body. {@code Cancelled}→200, {@code NotFound}→404, {@code NotCancellable}→409. The code
	 * is the bearer credential (invariant #7) and is never logged.
	 */
	@PostMapping("/{code}/cancel")
	ResponseEntity<?> cancel(@PathVariable String code) {
		return switch (cancelBooking.cancel(code)) {
			case CancelOutcome.Cancelled cancelled ->
					ResponseEntity.ok(CancellationView.of(code, cancelled));
			case CancelOutcome.NotFound ignored -> error(HttpStatus.NOT_FOUND, "NO_SUCH_BOOKING");
			case CancelOutcome.NotCancellable ignored -> error(HttpStatus.CONFLICT, "NOT_CANCELLABLE");
		};
	}

	@PostMapping
	ResponseEntity<?> create(@RequestBody CreateBookingRequest request) {
		BookingOutcome outcome = createBooking.create(request.toCommand());
		return switch (outcome) {
			case BookingOutcome.Confirmed confirmed -> ResponseEntity.status(HttpStatus.CREATED)
					.body(BookingConfirmationView.of(confirmed.confirmation()));
			// 202: created but awaiting the verified webhook (Stripe profile). The client uses the
			// clientSecret to complete the card payment; confirmation arrives via the webhook (#8).
			case BookingOutcome.AwaitingPayment awaiting -> ResponseEntity.status(HttpStatus.ACCEPTED)
					.body(AwaitingPaymentView.of(awaiting.confirmation(), awaiting.clientSecret(),
							awaiting.paymentIntentId()));
			case BookingOutcome.Rejected rejected -> switch (rejected) {
				case SET_TAKEN -> error(HttpStatus.CONFLICT, "SET_TAKEN");
				case NOT_ONLINE_POOL -> error(HttpStatus.UNPROCESSABLE_ENTITY, "SET_NOT_BOOKABLE_ONLINE");
				case BOOKING_CLOSED -> error(HttpStatus.UNPROCESSABLE_ENTITY, "BOOKING_CLOSED");
				case NO_SUCH_SET -> error(HttpStatus.NOT_FOUND, "NO_SUCH_SET");
			};
		};
	}

	/** Malformed request body (missing/invalid fields, bad date) → 400. */
	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<Map<String, String>> onInvalidRequest(IllegalArgumentException e) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
	}

	private static ResponseEntity<Map<String, String>> error(HttpStatus status, String code) {
		return ResponseEntity.status(status).body(Map.of("error", code));
	}
}
