package ai.riviera.platform.booking.infrastructure.in;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;

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

	BookingController(CreateBooking createBooking) {
		this.createBooking = createBooking;
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
