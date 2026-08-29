package ai.riviera.platform.booking.adapter.in;

import java.net.URI;
import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.request.WithdrawOutcome;
import ai.riviera.platform.booking.application.request.WithdrawRequest;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Public tourist booking endpoint (U3). Driving adapter — depends only on the
 * {@code booking} module's {@link CreateBooking} port (invariant #11). Maps the sealed
 * {@link BookingOutcome} to HTTP via an exhaustive {@code switch}: {@code Confirmed}→201,
 * {@code SET_TAKEN}→409, {@code NOT_ONLINE_POOL}/{@code BOOKING_CLOSED}→422,
 * {@code NO_SUCH_SET}→404; malformed input→400 via {@code ApiErrorHandler}. Errors are
 * RFC-7807 {@link ProblemDetail} built by {@link ApiProblem}.
 */
@RestController
@RequestMapping("/api/bookings")
class BookingController {

	/**
	 * The unknown-code answer, shared by the view, cancel and withdraw legs (all three code-gated).
	 * Named for the situation rather than for the wire code, so it does not read as a shadow of the
	 * {@code WithdrawOutcome.Rejected.NO_SUCH_BOOKING} case label it sits beside.
	 */
	private static final String UNKNOWN_CODE = "NO_SUCH_BOOKING";
	private static final String UNKNOWN_CODE_DETAIL = "No booking with this code.";

	private final CreateBooking createBooking;
	private final ViewBooking viewBooking;
	private final CancelBooking cancelBooking;
	private final WithdrawRequest withdrawRequest;
	private final CurrentCustomer currentCustomer;
	private final CancellationPolicy cancellationPolicy;

	BookingController(CreateBooking createBooking, ViewBooking viewBooking, CancelBooking cancelBooking,
			WithdrawRequest withdrawRequest, CurrentCustomer currentCustomer,
			CancellationPolicy cancellationPolicy) {
		this.createBooking = createBooking;
		this.viewBooking = viewBooking;
		this.cancelBooking = cancelBooking;
		this.withdrawRequest = withdrawRequest;
		this.currentCustomer = currentCustomer;
		this.cancellationPolicy = cancellationPolicy;
	}

	/**
	 * The pre-reserve cancellation-terms quote for a set + date (#795) — a public tourist read (the
	 * venue-map-read precedent; invariant #13 targets operator surfaces). The literal segment ranks
	 * above the sibling {@code /{code}} template, so neither route shadows the other.
	 */
	@GetMapping("/cancellation-terms")
	ResponseEntity<?> cancellationTerms(@RequestParam long setId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return cancellationPolicy.terms(new SetId(setId), date)
				.<ResponseEntity<?>>map(terms -> ResponseEntity.ok(CancellationTermsView.of(terms)))
				.orElseGet(() -> error(HttpStatus.NOT_FOUND, "NO_SUCH_SET", "No such set."));
	}

	/**
	 * View a booking by its code (U6). The code is the bearer credential (invariant #7) — knowing it
	 * authorizes the view; it is never logged. Returns the summary + server-computed refund terms, or
	 * {@code 404} for an unknown code.
	 */
	@GetMapping("/{code}")
	ResponseEntity<?> view(@PathVariable String code) {
		return viewBooking.byCode(code)
				.<ResponseEntity<?>>map(detail -> ResponseEntity.ok(BookingDetailView.of(detail)))
				.orElseGet(() -> error(HttpStatus.NOT_FOUND, UNKNOWN_CODE, UNKNOWN_CODE_DETAIL));
	}

	/**
	 * Cancel a booking by its code (U6). The refund is computed server-side (invariant #10) — no
	 * request body. {@code Cancelled}→200, {@code NotFound}→404, {@code NotCancellable} and
	 * {@code WindowClosed}→409 under distinct codes. The code is the bearer credential (invariant #7)
	 * and is never logged.
	 */
	@PostMapping("/{code}/cancel")
	ResponseEntity<?> cancel(@PathVariable String code) {
		return switch (cancelBooking.cancel(code)) {
			case CancelOutcome.Cancelled cancelled ->
					ResponseEntity.ok(CancellationView.of(code, cancelled));
			case CancelOutcome.NotFound ignored ->
					error(HttpStatus.NOT_FOUND, UNKNOWN_CODE, UNKNOWN_CODE_DETAIL);
			case CancelOutcome.NotCancellable ignored -> error(HttpStatus.CONFLICT, "NOT_CANCELLABLE",
					"This booking can no longer be cancelled.");
			case CancelOutcome.WindowClosed ignored ->
					error(HttpStatus.CONFLICT, "CANCELLATION_WINDOW_CLOSED",
							"Cancellation closed when the booking date began.");
		};
	}

	/**
	 * Withdraw a pending booking request by its code. Like cancel, the code is the whole
	 * authorization (invariant #7) and there is no request body. {@code Withdrawn}→200,
	 * {@code NO_SUCH_BOOKING}→404, {@code NOT_PENDING}→409. No money is involved — a pending request
	 * has no PaymentIntent on record — so there is no refund to report, only the new terminal status.
	 */
	@PostMapping("/{code}/withdraw")
	ResponseEntity<?> withdraw(@PathVariable String code) {
		return switch (withdrawRequest.withdraw(code)) {
			case WithdrawOutcome.Withdrawn ignored ->
					ResponseEntity.ok(WithdrawalView.of(code));
			case WithdrawOutcome.Rejected rejected -> switch (rejected) {
				case NO_SUCH_BOOKING ->
						error(HttpStatus.NOT_FOUND, UNKNOWN_CODE, UNKNOWN_CODE_DETAIL);
				case NOT_PENDING -> error(HttpStatus.CONFLICT, "REQUEST_NOT_PENDING",
						RequestProblemDetails.NOT_PENDING);
			};
		};
	}

	@PostMapping
	ResponseEntity<?> create(@RequestBody CreateBookingRequest request, Authentication authentication) {
		// Signed-in checkout links the booking to the customer's account (S3); a guest / anonymous
		// principal resolves to null → an unchanged guest booking (invariant #2/#4 flows untouched). The
		// account id comes from the SESSION principal only, never the request body (BOLA-safe).
		CustomerAccountId accountId = currentCustomer.optional(authentication).orElse(null);
		// The conversion wrap keeps bad request input a 400 while a service-level IAE stays a 500.
		BookingOutcome outcome = createBooking.create(
				InvalidApiRequestException.parsing(() -> request.toCommand(accountId)));
		return switch (outcome) {
			case BookingOutcome.Confirmed confirmed -> ResponseEntity.status(HttpStatus.CREATED)
					.body(BookingConfirmationView.of(confirmed.confirmation()));
			// 202: created but awaiting the verified webhook (Stripe profile). The client uses the
			// clientSecret to complete the card payment; confirmation arrives via the webhook (#8).
			case BookingOutcome.AwaitingPayment awaiting -> ResponseEntity.status(HttpStatus.ACCEPTED)
					.body(AwaitingPaymentView.of(awaiting.confirmation(), awaiting.clientSecret(),
							awaiting.paymentIntentId()));
			// 202: a Request-to-Book venue — created PENDING_REQUEST, no payment until the venue
			// accepts. The guest tracks status (and later pays) via the code-gated view.
			case BookingOutcome.Requested requested -> ResponseEntity.status(HttpStatus.ACCEPTED)
					.body(RequestedView.of(requested.confirmation(), requested.requestExpiresAt()));
			case BookingOutcome.Rejected rejected -> switch (rejected) {
				case SET_TAKEN -> error(HttpStatus.CONFLICT, "SET_TAKEN",
						"The set is already taken for this date.");
				case NOT_ONLINE_POOL -> error(HttpStatus.UNPROCESSABLE_ENTITY, "SET_NOT_BOOKABLE_ONLINE",
						"This set is not bookable online.");
				case BOOKING_CLOSED -> error(HttpStatus.UNPROCESSABLE_ENTITY, "BOOKING_CLOSED",
						"Online booking for this date has closed.");
				case NO_SUCH_SET -> error(HttpStatus.NOT_FOUND, "NO_SUCH_SET",
						"No such set.");
			};
		};
	}

	/**
	 * The code-scoped request paths ({@code /api/bookings/{code}…}) carry the booking code — a
	 * bearer credential (invariant #7). {@link ApiProblem} already redacts {@code instance}; this
	 * controller overrides it with the known-safe collection path, which is more informative than
	 * the redaction placeholder. The ITs assert the code never appears in an error body.
	 */
	private static final URI BOOKINGS_PATH = URI.create("/api/bookings");

	private static ResponseEntity<ProblemDetail> error(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ApiProblem.of(status, code, detail);
		problem.setInstance(BOOKINGS_PATH);
		return ResponseEntity.status(status).body(problem);
	}
}
