package ai.riviera.platform.notification;

import java.time.LocalDate;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * What a booking-confirmation mail IT needs before it can assert anything: a confirmable booking, a
 * way to publish its {@code BookingConfirmed} so the after-commit registry vehicle actually runs,
 * and a read of what the Event Publication Registry still owes for it.
 *
 * <p>Extracted at #407 from {@code RegistryMailBulkheadIT}, which had all of it inline, so the
 * saturation IT could reuse rather than re-derive it — and so the two disciplines below are stated
 * once. Not a Spring bean: each IT builds one from its own autowired collaborators, which keeps it
 * out of every other context in the suite.
 *
 * <p><strong>Bookings are SQL-seeded and never claimed through {@code availability}.</strong> A
 * claimed {@code (set, date)} row is never released (invariant #2), so classes that seed bookings
 * must not compete for dates; each caller picks dates no other IT uses.
 *
 * <p><strong>Publications are matched on the amount, not the booking id.</strong> A
 * {@code BookingConfirmed} payload carries {@code bookingId}, {@code venueId} and {@code setId} as
 * identically-shaped {@code {"value":n}} records, so matching a bare {@code "value":<id>} also
 * matches another test's row whose venue or set happens to share the number — and ids here are small
 * integers in a database several IT classes write to. Callers pass a deliberately-improbable amount
 * per test; the lesson is {@code EventRegistryDurabilityIT}'s, paid for once already.
 */
public final class ConfirmationMailFixtures {

	/**
	 * The registry's id for the confirmation listener, exactly as V31 (#382) migrated it. It embeds
	 * the listener FQCN and signature, and republication matches it string-equal, so drift here
	 * dead-letters every outstanding row.
	 */
	public static final String LISTENER_ID = "ai.riviera.platform.notification.adapter.in."
			+ "BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";

	private final JdbcClient jdbc;
	private final TransactionTemplate transactions;
	private final ApplicationEventPublisher publisher;

	public ConfirmationMailFixtures(JdbcClient jdbc, PlatformTransactionManager txManager,
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
						+ "VALUES (:e, 'Bulkhead Guest', '+355781') RETURNING id")
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
		return new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, amountMinor, "EUR");
	}

	/** How much the registry still owes the confirmation listener for one test's event. */
	public long outstandingMailPublications(long amountMinor) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE completion_date IS NULL AND listener_id = :listener
				  AND serialized_event LIKE :amountFragment
				""")
				.param("listener", LISTENER_ID).param("amountFragment", "%" + amountMinor + "%")
				.query(Long.class).single();
	}

	/** Every listener with an outstanding row for one test's event, whatever its id reads as. */
	public List<String> outstandingListenerIds(long amountMinor) {
		return jdbc.sql("SELECT listener_id FROM event_publication "
						+ "WHERE completion_date IS NULL AND serialized_event LIKE :amountFragment")
				.param("amountFragment", "%" + amountMinor + "%")
				.query(String.class).list();
	}
}
