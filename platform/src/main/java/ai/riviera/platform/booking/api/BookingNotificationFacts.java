package ai.riviera.platform.booking.api;

import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;

/**
 * The {@code booking} module's published <strong>notification-facts</strong> query port (invariant
 * #11) — the booking-relevant truths a consumer needs to tell the guest about one booking,
 * split by consumer role from {@link DailyTakings} so each caller depends
 * only on the surface it uses. Consumed by the platform edge, whose booking-confirmation mail
 * listener reacts to {@code BookingConfirmed}.
 *
 * <p>Synchronous query rather than a widened event payload, for two reasons that pull the same way:
 * the arrival code must not be persisted into the Event Publication Registry (invariant #7 — see
 * {@link BookingNotificationInfo}), and an async listener runs after commit, so re-loading current
 * state through an {@code api/} port is the documented pattern for anything the payload does not
 * carry.
 *
 * <p>Read-only: it selects two columns from {@code booking}, touches no availability state
 * (invariant #2) and writes nothing.
 */
public interface BookingNotificationFacts {

	/**
	 * The arrival code and guest-contact id of the booking with this id, or empty if no booking has
	 * it. Deliberately <strong>not</strong> filtered by status: the caller is reacting to a published
	 * confirmation fact, and a booking cancelled between that fact and the (asynchronous) read must
	 * still resolve rather than vanish.
	 */
	Optional<BookingNotificationInfo> notificationInfo(BookingId bookingId);

	/**
	 * Everything needed to rebuild this booking's confirmation mail without an event to read it from
	 * — the admin resend's read. Empty if no booking has this id.
	 *
	 * <p>The same conversation as {@link #notificationInfo}, for the trigger that has no payload:
	 * where the registry listener is handed the date, amount and currency by {@code BookingConfirmed},
	 * a resend must ask the module that owns them. It does <strong>not</strong> supersede the narrower
	 * read — the listener keeps taking those three off the event on purpose, so a later edit can never
	 * rewrite the mail for a confirmation that already happened.
	 *
	 * <p>Also unfiltered by status, and for a sharper reason than above: whether a confirmation was
	 * ever due is reported as {@link BookingConfirmationFacts#everConfirmed()} rather than by returning
	 * empty, so the caller can refuse a never-confirmed booking with a reason instead of an absence.
	 */
	Optional<BookingConfirmationFacts> confirmationFacts(BookingId bookingId);
}
