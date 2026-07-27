package ai.riviera.platform.booking.api;

import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;

/**
 * The {@code booking} module's published <strong>notification-facts</strong> query port (invariant
 * #11, #371) — the booking-relevant truths a consumer needs to tell the guest about one booking,
 * split by consumer role from {@link DailyTakings} (the issue #94 precedent) so each caller depends
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
}
