package ai.riviera.platform.notification.application;

import java.util.Collection;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The booking-confirmation mail delivery log — this module's record of what it did about each
 * confirmation mail, written at send time and read by the admin mail-delivery view.
 *
 * <p>Module-internal driven port (its adapter is this module's own, so it stays in
 * {@code application} rather than graduating to {@code api}/{@code spi} — invariant #11).
 *
 * <p><strong>Append-only, and not a source of truth for anything.</strong> Nothing branches on this
 * log: the automatic send is idempotent through the Event Publication Registry and a resend is
 * a deliberate duplicate, so the log is evidence, never a gate. That is what lets its writes be
 * best-effort relative to the send they describe — a failed append costs a history row, while a
 * failed append that <em>threw</em> would cost a duplicated mail on the registry's next retry.
 */
public interface ConfirmationMailAttempts {

	/** Record one attempt. Never merges with an existing row: a repeat attempt is a second fact. */
	void append(MailAttempt attempt);

	/**
	 * Every recorded attempt for these bookings, newest first. An empty collection answers empty
	 * without touching the database.
	 */
	List<MailAttempt> historyFor(Collection<BookingId> bookingIds);
}
