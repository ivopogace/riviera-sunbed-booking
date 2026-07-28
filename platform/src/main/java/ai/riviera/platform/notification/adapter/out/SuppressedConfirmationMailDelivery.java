package ai.riviera.platform.notification.adapter.out;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.EmailSuppressions;

/**
 * Answers {@code booking}'s {@link ConfirmationMailDelivery} port from this module's own state
 * (#390): resolve the customer's address through {@code customer}'s published lookup, then consult
 * the do-not-mail list — the same pair {@code BookingConfirmationMailListener} drives through the
 * send chokepoint, so on the healthy path the surface's claim and the send decision agree by
 * construction.
 *
 * <p><strong>They can still disagree on the unhealthy path, and that is the accepted trade.</strong>
 * The send path <em>propagates</em> a failed suppression lookup so the Event Publication Registry
 * keeps the publication outstanding and re-evaluates on retry; this path <em>degrades</em> to "not
 * withheld". So during a database blip the page may say nothing while the later retry correctly
 * skips the send — a missing notice, never a false one. The asymmetry is deliberate: there the
 * throw protects a mail, here it would break the page carrying the guest's only copy of the booking
 * code.
 *
 * <p><strong>Only under the {@code stripe} profile</strong>, and that is a security gate, not a
 * packaging detail. #390's whole non-enumeration argument is "the requester already paid, so the leak
 * value is minimal" — and the gate implementing it is {@code status == CONFIRMED}. That equivalence
 * holds only where a real gateway stands between the two: under the default profile the in-process
 * stub returns {@code Succeeded} synchronously, so {@code POST /api/bookings} yields {@code 201
 * CONFIRMED} with nothing collected, and answering here would be a free suppression oracle for any
 * address (D-8). Where confirmation is not proof of payment, {@link NonDisclosingConfirmationMailDelivery}
 * answers instead — never. Pinned by {@code ConfirmationMailDeliveryProfileWiringTest}.
 *
 * <p><strong>A fault barrier, by contract.</strong> {@link ConfirmationMailDelivery} promises never
 * to throw for an operational failure, so this catches {@code RuntimeException} rather than the
 * narrower {@code DataAccessException} the convention would prefer — the reachable throwers are not
 * all data-access ({@code keyOf}'s missing-HMAC {@code IllegalStateException}, a contact record that
 * fails its own validation), and the caller in {@code CreateBookingService} runs <em>after</em> the
 * booking is confirmed and the payment collected, where a throw is uncompensatable and costs the
 * guest the code. Bounded by this module's own {@code queryTimeout} (#386), so a wedged read aborts
 * rather than hanging the response.
 */
@Component
@Profile("stripe")
class SuppressedConfirmationMailDelivery implements ConfirmationMailDelivery {

	private static final Logger log = LoggerFactory.getLogger(SuppressedConfirmationMailDelivery.class);

	private final CustomerLookup customers;
	private final EmailSuppressions suppressions;

	SuppressedConfirmationMailDelivery(CustomerLookup customers, EmailSuppressions suppressions) {
		this.customers = customers;
		this.suppressions = suppressions;
	}

	@Override
	public boolean isWithheld(CustomerId customerId) {
		try {
			return customers.findById(customerId)
					.map(contact -> suppressions.isSuppressed(contact.email()))
					.orElse(false);
		}
		catch (RuntimeException e) {
			// No address in the line (the module's PII posture); the correlation id rides the MDC.
			log.warn("Suppression lookup failed for a confirmation view ({}); omitting the notice",
					e.getClass().getSimpleName());
			return false;
		}
	}
}
