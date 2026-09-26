package ai.riviera.platform.notification.application;

import java.util.Collection;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The booking-confirmation mail delivery log, written at send time and read by the admin
 * mail-delivery view. Module-internal driven port, so it stays in {@code application}
 * (invariant #11).
 *
 * <p><strong>Append-only evidence, never a gate:</strong> nothing branches on it (the registry
 * makes the automatic send idempotent; a resend is a deliberate duplicate), so writes are
 * best-effort — an append that <em>threw</em> would cost a duplicated mail on the registry's retry.
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
