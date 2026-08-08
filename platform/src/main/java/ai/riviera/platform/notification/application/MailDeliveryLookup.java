package ai.riviera.platform.notification.application;

import java.util.List;

/**
 * What happened to the confirmation mail for each booking made with one email address — the
 * driving port behind the admin console's mail-delivery lookup.
 *
 * <p><strong>Keyed on the address, because that is what a support call contains.</strong> Anyone able
 * to quote their arrival code can also quote the address they booked with; the reverse is false — a
 * tourist who lost the confirmation screen has no code — and the address is what the mail was sent to,
 * so it is the key the thing being debugged is actually identified by.
 *
 * <p>The address never travels further than {@code customer::api}: it is resolved to a guest-contact id
 * there, and every read after that is by id. Nothing in this module stores it.
 */
public interface MailDeliveryLookup {

	/**
	 * The bookings made with this address and their mail history, newest booking first. Empty when the
	 * address is unknown <em>and</em> when it is known with no bookings — deliberately the same answer,
	 * so the surface cannot be read as a "does this address exist" oracle.
	 */
	List<MailDeliveryBooking> forEmail(String email);
}
