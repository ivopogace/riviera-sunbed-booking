package ai.riviera.platform.booking.spi;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Whether the booking-confirmation mail will be <strong>withheld</strong> from a customer (#390) —
 * the cross-module driven port {@code booking} declares and {@code notification} implements.
 *
 * <p>The suppression list's defining invariant — <em>no send to a suppressed address</em> (#382) —
 * means a tourist with a hard-bounced or complained address books and pays normally while the
 * confirmation mail is silently dropped. For a guest that is severe: the confirmation screen and the
 * booking-code URL (ADR-0006) are their only record. This port lets the confirmation surface say so.
 *
 * <p>The inversion is load-bearing: {@code notification} already depends on {@code booking} (its
 * {@code BookingConfirmed} listener), so a {@code booking → notification} edge would close a cycle.
 * Declaring the port here and granting {@code booking::spi} to the implementor keeps the graph
 * acyclic — the same shape as {@code customer.spi.GuestBookingHistory}, implemented by
 * {@code booking}.
 *
 * <p>Answered <strong>live</strong>, never recorded from a send attempt. The {@code 201}
 * instant-confirm response body is built before the after-commit mail listener has run, so a
 * recorded outcome could not populate that surface at all, and would race the stripe profile's
 * confirmation poll.
 *
 * <p><strong>Read it as a present-tense question</strong> — <em>would</em> a confirmation mail to
 * this customer be withheld <em>now</em> — not as the historical fact that a particular send was
 * skipped. The two coincide at confirmation time, which is the only moment #390's surfaces ask. They
 * drift afterwards: a later hard bounce (#370's feed) makes a delivered mail read as withheld, and
 * an ADMIN reinstatement (#391, V35) makes a genuinely skipped one read as delivered. Any consumer
 * that needs the historical fact must record it at send time instead of calling this.
 *
 * <p>Callers must consult this <strong>only for a booking that is already confirmed</strong>:
 * answering it earlier would turn the code-gated booking view into a suppression oracle for any
 * address someone can start a checkout with (D-8 non-enumeration).
 *
 * <p>Never throws for an operational failure — an unanswerable lookup reports {@code false}, so the
 * confirmation view degrades to "no notice" instead of failing. The booking code on that page is the
 * guest's only record; losing the page is strictly worse than losing the notice.
 */
public interface ConfirmationMailDelivery {

	/** Whether a confirmation mail to this customer's address would be withheld as suppressed. */
	boolean isWithheld(CustomerId customerId);
}
