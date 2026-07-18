package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.CurrentCustomer;
import ai.riviera.platform.booking.application.view.MyBookings;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * The signed-in tourist's "my bookings" endpoint (S3, #114). Driving adapter — depends only on the
 * {@code booking} module's {@link MyBookings} port (invariant #11) plus the edge {@link CurrentCustomer}
 * to resolve the principal.
 *
 * <p><strong>Authorization is the session principal, never a request parameter</strong> (BOLA-safe,
 * invariant #13 posture): {@code /api/me/**} is role-gated to {@code CUSTOMER} in {@code SecurityConfig}
 * (anonymous → 401, an operator session → 403), and {@link CurrentCustomer#require} resolves the
 * authenticated customer's own {@link CustomerAccountId} — there is no path/query id a caller could
 * substitute to read another customer's bookings. A {@code GET}, so it is CSRF-exempt by method.
 */
@RestController
@RequestMapping("/api/me")
class MyBookingsController {

	private final MyBookings myBookings;
	private final CurrentCustomer currentCustomer;

	MyBookingsController(MyBookings myBookings, CurrentCustomer currentCustomer) {
		this.myBookings = myBookings;
		this.currentCustomer = currentCustomer;
	}

	@GetMapping("/bookings")
	List<MyBookingView> list(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		return myBookings.forCustomer(accountId).stream().map(MyBookingView::of).toList();
	}
}
