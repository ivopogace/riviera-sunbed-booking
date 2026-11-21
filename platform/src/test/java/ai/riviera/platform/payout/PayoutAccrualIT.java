package ai.riviera.platform.payout;

import java.time.Duration;
import java.time.LocalDate;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * End-to-end accrual through the async {@code @ApplicationModuleListener} + Event Publication
 * Registry (issue #9):
 * <ul>
 *   <li><strong>AC-2:</strong> a {@link BookingConfirmed} accrues exactly one {@code ACCRUAL} entry
 *       with {@code net = gross − commission} (the venue's rate, 1500 bps).</li>
 *   <li><strong>AC-3:</strong> the same event delivered twice (registry/Stripe at-least-once) still
 *       yields exactly one entry — no double-accrual (invariant #9).</li>
 * </ul>
 * Events are published inside a transaction (so the {@code AFTER_COMMIT} registry-backed listener
 * fires) and the asynchronous result is awaited. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutAccrualIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	IncompleteEventPublications incompletePublications;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	/** This test's own venue: its bookings and ledger rows reach no other class, and leave with it (#2, #9). */
	private StayFixtures.Venue venue;

	@BeforeEach
	void ownVenue() {
		venue = StayFixtures.venue(jdbc, "INSTANT", null, false);
	}

	@AfterEach
	void removeVenue() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	private record Ref(long bookingId, long venueId, long setId) {
	}

	/** Insert a real CONFIRMED booking (the FK target) on this test's own venue. */
	private Ref insertConfirmedBooking(String code) {
		long[] set = {venue.online().getFirst().value(), venue.id()};
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("date", LocalDate.of(2029, 7, 1))
				.query(Long.class).single();
		return new Ref(booking, set[1], set[0]);
	}

	private BookingConfirmed event(Ref b) {
		return new BookingConfirmed(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), LocalDate.of(2029, 7, 1), 4500L, "EUR", CancellationWindow.FREE, 0);
	}

	/** Publish inside a transaction so the AFTER_COMMIT registry listener is triggered. */
	private void publishInTransaction(BookingConfirmed event) {
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(event));
	}

	private long accrualRows(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private long netFor(long bookingId) {
		return jdbc.sql("SELECT net_minor FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	@Test
	void accruesOnceOnConfirmation() {
		Ref b = insertConfirmedBooking("ACCR0001");

		publishInTransaction(event(b));

		Awaitility.await().atMost(WAIT)
				.untilAsserted(() -> assertEquals(1L, accrualRows(b.bookingId())));
		assertEquals(3825L, netFor(b.bookingId()), "net = 4500 - 15% commission (675)");
	}

	@Test
	void redeliveryIsIdempotent() {
		Ref b = insertConfirmedBooking("ACCR0002");
		BookingConfirmed event = event(b);

		publishInTransaction(event);
		publishInTransaction(event); // registry/Stripe at-least-once redelivery

		// One entry appears, and the count never climbs above 1 once settled (no double-accrual).
		Awaitility.await().atMost(WAIT)
				.untilAsserted(() -> assertEquals(1L, accrualRows(b.bookingId())));
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> accrualRows(b.bookingId()) == 1L);

		// The identical second publish can lose its registry completion race; re-drive it so none stays open.
		incompletePublications.resubmitIncompletePublications(publication -> event.equals(publication.getEvent()));
	}
}
