package ai.riviera.platform.notification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.RegistryRows;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.events.BookingMoved;
import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * What a booking-mail IT needs before it can assert anything: a seeded booking, a way to publish the
 * event that drives the mail so the after-commit registry vehicle actually runs, and a read of what
 * the Event Publication Registry still owes for it.
 *
 * <p>Extracted from {@code RegistryMailBulkheadIT}, which had all of it inline, so the
 * saturation IT could reuse rather than re-derive it — and so the two disciplines below are stated
 * once. Renamed from {@code ConfirmationMailFixtures} when the cancellation mail became a
 * second registry vehicle needing the identical seed: the disciplines below are properties of
 * <em>this database and this registry</em>, not of one message kind, and a name saying otherwise
 * would have invited a second near-copy. Not a Spring bean: each IT builds one from its own
 * autowired collaborators, which keeps it out of every other context in the suite.
 *
 * <p><strong>Bookings are SQL-seeded and never claimed through {@code availability}.</strong> A
 * claimed {@code (set, date)} row is never released (invariant #2), so classes that seed bookings
 * must not compete for dates; each caller picks dates no other IT uses.
 *
 * <p><strong>Publications are matched on the event's {@code bookingId} field</strong>
 * ({@link RegistryRows#NAMES_BOOKING}) beside the listener's pinned {@code event_type}. A seeded
 * booking's id is the database's own, so no other IT's row carries it; a test publishing for an id
 * nothing resolves picks one no other IT publishes for that event type.
 */
public final class BookingMailFixtures {

	/**
	 * The confirmation listener's explicit registry id. Like every id below it is pinned by
	 * {@code ListenerIdSnapshotTest} and against the live registry by {@code RegistryMailBulkheadIT}.
	 */
	public static final String LISTENER_ID = "notification.mail-on-booking-confirmed";

	/** The cancellation listener's explicit registry id ({@code BookingCancellationMailIT} pins the write). */
	public static final String CANCELLATION_LISTENER_ID = "notification.mail-on-booking-cancelled";

	/** The payment-due listener's explicit registry id. */
	public static final String PAYMENT_DUE_LISTENER_ID = "notification.mail-on-booking-payment-due";

	/** The request-declined listener's explicit registry id. */
	public static final String REQUEST_DECLINED_LISTENER_ID = "notification.mail-on-booking-request-declined";

	/** The move-reminder listener's explicit registry id. */
	public static final String MOVE_REMINDER_LISTENER_ID = "notification.mail-on-stay-move-due";

	/** The refunded-day listener's explicit registry id. */
	public static final String DAY_REFUND_LISTENER_ID = "notification.mail-on-booking-day-refunded";

	/** The booking-moved listener's explicit registry id. */
	public static final String BOOKING_MOVED_LISTENER_ID = "notification.mail-on-booking-moved";

	/** The request-expired listener's explicit registry id. */
	public static final String REQUEST_EXPIRED_LISTENER_ID = "notification.mail-on-booking-request-expired";

	/** The event each listener above consumes: every registry read pins {@code event_type} beside the booking. */
	private static final Map<String, Class<?>> EVENT_TYPE_BY_LISTENER = Map.of(
			LISTENER_ID, BookingConfirmed.class,
			CANCELLATION_LISTENER_ID, BookingCancelled.class,
			PAYMENT_DUE_LISTENER_ID, BookingPaymentDue.class,
			REQUEST_DECLINED_LISTENER_ID, BookingRequestDeclined.class,
			MOVE_REMINDER_LISTENER_ID, StayMoveDue.class,
			DAY_REFUND_LISTENER_ID, BookingDayRefunded.class,
			BOOKING_MOVED_LISTENER_ID, BookingMoved.class,
			REQUEST_EXPIRED_LISTENER_ID, BookingRequestExpired.class);

	private final JdbcClient jdbc;
	private final TransactionTemplate transactions;
	private final ApplicationEventPublisher publisher;

	public BookingMailFixtures(JdbcClient jdbc, PlatformTransactionManager txManager,
			ApplicationEventPublisher publisher) {
		this.jdbc = jdbc;
		this.transactions = new TransactionTemplate(txManager);
		this.publisher = publisher;
	}

	/** A seeded set, carrying the venue it belongs to so a booking row can name both. */
	public record SetRef(long setId, long venueId) {
	}

	public SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	public long seedBooking(SetRef set, String code, LocalDate date, String contactEmail, long amountMinor,
			String status) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Registry Mail Guest', '+355781') RETURNING id")
				.param("e", contactEmail).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, :amount, 'EUR', :status)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", date).param("amount", amountMinor)
				.param("status", status)
				.query(Long.class).single();
	}

	/** Publish inside a transaction so the AFTER_COMMIT registry-backed listeners are triggered. */
	public void publishInTransaction(Object event) {
		transactions.executeWithoutResult(status -> publisher.publishEvent(event));
	}

	public BookingConfirmed confirmationOf(SetRef set, long bookingId, LocalDate date, long amountMinor) {
		return confirmationOf(set, bookingId, date, amountMinor, CancellationWindow.FREE, 0);
	}

	/** The stamped form (#795): callers pinning the disclosure pass the birth window explicitly. */
	public BookingConfirmed confirmationOf(SetRef set, long bookingId, LocalDate date, long amountMinor,
			CancellationWindow windowAtBirth, int lateCancelRefundBps) {
		return new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, amountMinor, "EUR", windowAtBirth, lateCancelRefundBps);
	}

	/** The cancellation an IT publishes to drive the mail. */
	public BookingCancelled cancellationOf(SetRef set, long bookingId, LocalDate date, long refundMinor,
			RefundReason reason) {
		return new BookingCancelled(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, refundMinor, "EUR", reason);
	}

	/** The payment-due fact an IT publishes to drive the mail. */
	public BookingPaymentDue paymentDueOf(SetRef set, long bookingId, LocalDate date, long amountMinor,
			Instant payBy) {
		return paymentDueOf(set, bookingId, date, amountMinor, payBy, CancellationWindow.FREE, 0);
	}

	/** The payment-due fact for a stay of {@code first..last}. */
	public BookingPaymentDue paymentDueOf(SetRef set, long bookingId, LocalDate first, LocalDate last,
			long amountMinor, Instant payBy) {
		return new BookingPaymentDue(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), first, last, payBy, amountMinor, "EUR", CancellationWindow.FREE, 0);
	}

	/** The stamped form (#795): callers pinning the disclosure pass the birth window explicitly. */
	public BookingPaymentDue paymentDueOf(SetRef set, long bookingId, LocalDate date, long amountMinor,
			Instant payBy, CancellationWindow windowAtBirth, int lateCancelRefundBps) {
		return new BookingPaymentDue(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, date, payBy, amountMinor, "EUR", windowAtBirth, lateCancelRefundBps);
	}

	/** The decline fact an IT publishes to drive the mail. */
	public BookingRequestDeclined requestDeclinedOf(SetRef set, long bookingId, LocalDate date) {
		return requestDeclinedOf(set, bookingId, date, date);
	}

	/** The venue's own decline of a stay of {@code first..last}. */
	public BookingRequestDeclined requestDeclinedOf(SetRef set, long bookingId, LocalDate first, LocalDate last) {
		return new BookingRequestDeclined(new BookingId(bookingId), new SetId(set.setId()), first, last);
	}

	/** The decline fact with the reason the mail names (ADR-0025). */
	public BookingRequestDeclined requestDeclinedOf(SetRef set, long bookingId, LocalDate date,
			ai.riviera.platform.booking.vocabulary.DeclineReason reason) {
		return new BookingRequestDeclined(new BookingId(bookingId), new SetId(set.setId()), date, date, reason);
	}

	/** The move fact an IT publishes to drive the mail; the booking must carry a receipt move and {@code moved_at}. */
	public ai.riviera.platform.booking.events.BookingMoved movedOf(SetRef from, long toSetId, long bookingId,
			LocalDate date) {
		return movedOf(from, toSetId, bookingId, date, date);
	}

	/** A stay's move fact, first to last day. */
	public ai.riviera.platform.booking.events.BookingMoved movedOf(SetRef from, long toSetId, long bookingId,
			LocalDate first, LocalDate last) {
		return new ai.riviera.platform.booking.events.BookingMoved(new BookingId(bookingId), new VenueId(from.venueId()),
				new SetId(from.setId()), new SetId(toSetId), first, last);
	}

	/** The expiry fact an IT publishes to drive the mail. */
	public BookingRequestExpired requestExpiredOf(SetRef set, long bookingId, LocalDate date) {
		return requestExpiredOf(set, bookingId, date, date);
	}

	/** The expiry fact for a stay of {@code first..last}. */
	public BookingRequestExpired requestExpiredOf(SetRef set, long bookingId, LocalDate first, LocalDate last) {
		return new BookingRequestExpired(new BookingId(bookingId), new SetId(set.setId()), first, last);
	}

	/** How much the registry still owes the confirmation listener for one test's booking. */
	public long outstandingMailPublications(BookingId bookingId) {
		return outstandingPublicationsFor(LISTENER_ID, bookingId);
	}

	/** How much the registry still owes one listener for one test's booking, on {@link RegistryRows#NAMES_BOOKING}. */
	public long outstandingPublicationsFor(String listenerId, BookingId bookingId) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE completion_date IS NULL AND listener_id = :listener
				  AND event_type = :type AND %s
				""".formatted(RegistryRows.NAMES_BOOKING))
				.param("listener", listenerId).param("type", eventTypeOf(listenerId))
				.param("bookingId", RegistryRows.bookingIdParam(bookingId.value()))
				.query(Long.class).single();
	}

	/**
	 * Every listener with an outstanding row for one test's confirmation, whatever its id reads as:
	 * open across listeners by design, pinned to {@code BookingConfirmed} and the booking.
	 */
	public List<String> outstandingListenerIds(BookingId bookingId) {
		return jdbc.sql("""
				SELECT listener_id FROM event_publication
				WHERE completion_date IS NULL
				  AND event_type = :type AND %s
				""".formatted(RegistryRows.NAMES_BOOKING))
				.param("type", BookingConfirmed.class.getName())
				.param("bookingId", RegistryRows.bookingIdParam(bookingId.value()))
				.query(String.class).list();
	}

	private static String eventTypeOf(String listenerId) {
		Class<?> type = EVENT_TYPE_BY_LISTENER.get(listenerId);
		if (type == null) {
			throw new IllegalArgumentException("No event type registered for listener " + listenerId);
		}
		return type.getName();
	}
}
