package ai.riviera.platform.notification.adapter.out;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.EmailSuppressions;

/**
 * Answers {@code booking}'s {@link ConfirmationMailDelivery} port with the send chokepoint's pair: the
 * address via {@code customer}'s lookup, then the do-not-mail list. A fault barrier by the port's
 * contract: it catches {@code RuntimeException}, not just {@code DataAccessException} ({@code keyOf}'s
 * missing-HMAC throw is not data-access), since the caller runs after payment is collected and a throw
 * would cost the guest the code. It degrades to "not withheld" where the send path propagates and
 * retries, so a failing lookup may hide the notice, never show a false one.
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
		catch (RuntimeException e) {
			// No address in the line (the module's PII posture); the correlation id rides the MDC.
			// The exception rides along: a RuntimeException barrier catches programming errors too,
			// and a class name alone would leave them undiagnosable (the DataAccessException-only
			// barrier this widened from had a bounded, obvious cause set).
			log.warn("Suppression lookup failed for a confirmation view; omitting the notice", e);
			return false;
		}
	}
}
