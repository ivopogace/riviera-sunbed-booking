package ai.riviera.platform.booking.api;

import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingMoveFacts;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;

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

	/** What the stay confirmation mail renders, or empty if no stay has this id. Unfiltered by status. */
	Optional<StayConfirmationFacts> stayConfirmationFacts(StayId stayId);

	/** {@link #stayConfirmationFacts} of the stay this booking is a stretch of; empty for a lone booking. */
	Optional<StayConfirmationFacts> stayConfirmationFactsOf(BookingId bookingId);

	/**
	 * This booking's latest remodel move (both spots as they were, distance, when, exit deadline), or
	 * empty if none. The moved mail reads it here: {@code BookingMoved} carries ids and days only, and
	 * the old label is a receipt snapshot, since the live set may be renamed or retired.
	 */
	Optional<BookingMoveFacts> moveFacts(BookingId bookingId);

	/**
	 * The move the reminder mail names, keyed by the stretch the guest arrives on: empty unless that
	 * stretch is {@code CONFIRMED} and a live stretch of its stay on another set ends the day before, or
	 * either set has left the active map. Distance is read off the live map at send time.
	 */
	Optional<StayMoveFacts> moveReminderFacts(BookingId arrivingBookingId);

	/**
	 * Whether a venue's remodel ended this booking (refund, release or decline), not the guest's free
	 * exit: both arrive as {@code BookingCancelled} with {@code VENUE_CHANGE}, and only the commit
	 * receipt tells them apart. The cancellation mail offers to book again only in the first case.
	 */
	boolean endedByRemodel(BookingId bookingId);
}
