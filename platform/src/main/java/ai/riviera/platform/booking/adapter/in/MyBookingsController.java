package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.booking.application.view.MyBookings;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * The signed-in tourist's "my bookings" endpoint, over the {@link MyBookings} port (invariant #11)
 * plus the edge {@link CurrentCustomer} to resolve the principal.
 *
 * <p><strong>Authorization is the session principal, never a request parameter</strong> (BOLA-safe,
 * invariant #13 posture): {@code /api/me/**} is {@code CUSTOMER}-only in {@code SecurityConfig}
 * (anonymous → 401, operator → 403); {@link CurrentCustomer#require} resolves the caller's own
 * {@link CustomerAccountId}, with no path/query id to substitute. A {@code GET}: CSRF-exempt.
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
