package ai.riviera.platform.notification.adapter.out;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.EmailSuppressions;

/**
 * Answers {@code booking}'s {@link ConfirmationMailDelivery} port from this module's own state
 * (#390): resolve the customer's address through {@code customer}'s published lookup, then consult
 * the do-not-mail list — the same pair {@code BookingConfirmationMailListener} drives through the
 * send chokepoint, so the confirmation surface's claim and the send decision cannot diverge.
 *
 * <p><strong>Degrades rather than fails</strong>, and does so on <em>every</em> data-access failure —
 * deliberately wider than the send path's transient-only carve-out (#386). There the trade is about
 * a bearer-credential mail that must not be lost; here the caller is rendering the page carrying the
 * guest's only copy of the booking code, and a missing advisory notice is strictly less harmful than
 * a failed page. Bounded by the suppression adapter's own {@code queryTimeout} (#386), so a wedged
 * read aborts instead of hanging the response.
 */
@Component
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
		catch (DataAccessException e) {
			// No address in the line (the module's PII posture); the correlation id rides the MDC.
			log.warn("Suppression lookup failed for a confirmation view ({}); omitting the notice",
					e.getClass().getSimpleName());
			return false;
		}
	}
}
