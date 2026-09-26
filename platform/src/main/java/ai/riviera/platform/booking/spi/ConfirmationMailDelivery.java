package ai.riviera.platform.booking.spi;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Whether a confirmation mail to a customer would be withheld as suppressed <em>now</em>, so the
 * confirmation surface can say so; implemented by {@code notification}. A live, present-tense answer,
 * not a record of a skipped send — later bounces or reinstatements make the two drift, so record at
 * send time if you need history. Ask only for an already-confirmed booking, else it is a suppression
 * oracle (RESPONSIBILITIES.md §booking). Never throws: an unanswerable lookup reports {@code false}.
 */
public interface ConfirmationMailDelivery {

	/** Whether a confirmation mail to this customer's address would be withheld as suppressed. */
	boolean isWithheld(CustomerId customerId);
}
