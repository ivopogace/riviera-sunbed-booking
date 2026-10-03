package ai.riviera.platform.booking.adapter.in;


import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * Public tourist endpoint booking a stitched stay over {@link CreateStay} (invariant #11):
 * {@code Confirmed}→201, {@code AwaitingPayment}→202 with the group's one {@code clientSecret}, a
 * refusal as {@link Rejections} maps it, a malformed plan→400. Same gates as {@code POST /api/bookings}:
 * session-free, proof of work, per-IP rate limit.
 */
@RestController
@RequestMapping(StayController.STAYS_PATH)
class StayController {

	static final String STAYS_PATH = "/api/stays";

	private final CreateStay createStay;
	private final CustomerAccountDirectory customerDirectory;

	StayController(CreateStay createStay, CustomerAccountDirectory customerDirectory) {
		this.createStay = createStay;
		this.customerDirectory = customerDirectory;
	}

	@PostMapping
	ResponseEntity<?> create(@RequestBody CreateStayRequest request, Authentication authentication) {
		CustomerAccountId accountId = customerDirectory.signedInAccount(CustomerPrincipal.name(authentication),
				CustomerPrincipal.isCustomer(authentication)).orElse(null);
		StayOutcome outcome = createStay.create(InvalidApiRequestException.parsing(() -> request.toCommand(accountId)));
		return switch (outcome) {
			case StayOutcome.Confirmed confirmed -> ResponseEntity.status(HttpStatus.CREATED)
					.body(StayView.of(confirmed.confirmation()));
			case StayOutcome.AwaitingPayment awaiting -> ResponseEntity.status(HttpStatus.ACCEPTED)
					.body(new StayView.Awaiting(StayView.of(awaiting.confirmation()), awaiting.clientSecret(),
							awaiting.paymentIntentId()));
			case StayOutcome.Requested requested -> ResponseEntity.status(HttpStatus.ACCEPTED)
					.body(new StayView.Requested(StayView.of(requested.confirmation()), requested.requestExpiresAt()));
			case StayOutcome.Rejected rejected -> Rejections.respond(rejected.reason());
		};
	}
}
