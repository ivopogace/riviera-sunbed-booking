package ai.riviera.platform.booking.application.view;

import java.util.List;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * The signed-in tourist's "my bookings" use case (S3, #114): list the bookings linked to a customer
 * ACCOUNT. The module's inbound (driving) port — {@code MyBookingsController} depends on this
 * interface, not the concrete service (invariant #11 hexagonal layout), mirroring {@link ViewBooking}.
 *
 * <p>Authorization is the session principal: the caller resolves the {@link CustomerAccountId} from the
 * authenticated {@code CUSTOMER} at the edge and passes it here — one customer can never list another's
 * bookings (object-level, mirroring invariant #13's posture). Read-only.
 */
public interface MyBookings {

	/** The account's bookings, newest first, enriched for display; empty when it has none. */
	List<MyBookingSummary> forCustomer(CustomerAccountId accountId);
}
