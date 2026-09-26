package ai.riviera.platform.booking.api;

import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingMoveFacts;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;

/**
 * The {@code booking} module's published notification-facts query port (invariant #11): what
 * {@code notification} needs to tell a guest about one booking, split by consumer role from
 * {@link DailyTakings}. A synchronous query, never a widened event payload: the arrival code must not
 * be persisted in the Event Publication Registry (invariant #7), and an async listener runs after
 * commit, so it re-loads current state here. Read-only; touches no availability state.
 */
public interface BookingNotificationFacts {

	/**
	 * The arrival code and guest-contact id of this booking, or empty if no booking has this id.
	 * Unfiltered by status: a booking cancelled after the confirmation fact must still resolve.
	 */
	Optional<BookingNotificationInfo> notificationInfo(BookingId bookingId);

	/**
	 * What the admin resend rebuilds the confirmation mail from; empty if no booking has this id.
	 * Unfiltered by status; {@link BookingConfirmationFacts#everConfirmed()} lets a refusal say why.
	 * The first send keeps taking date and amount off the event, so an edit cannot rewrite it.
	 */
	Optional<BookingConfirmationFacts> confirmationFacts(BookingId bookingId);

	/**
	 * This booking's latest remodel move (both spots as they were, distance, when, exit deadline), or
	 * empty if none. The moved mail reads it here: {@code BookingMoved} carries ids and days only, and
	 * the old label is a receipt snapshot, since the live set may be renamed or retired.
	 */
	Optional<BookingMoveFacts> moveFacts(BookingId bookingId);

	/**
	 * Whether a venue's remodel ended this booking (refund, release or decline), not the guest's free
	 * exit: both arrive as {@code BookingCancelled} with {@code VENUE_CHANGE}, and only the commit
	 * receipt tells them apart. The cancellation mail offers to book again only in the first case.
	 */
	boolean endedByRemodel(BookingId bookingId);
}
