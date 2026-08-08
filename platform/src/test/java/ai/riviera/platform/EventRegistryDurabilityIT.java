package ai.riviera.platform;

import java.time.Duration;
import java.time.LocalDate;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the Event Publication Registry's durability configuration (AC-5), because that
 * configuration <em>is</em> the booking-confirmation email's idempotency and retry story — there is
 * no dedupe table behind it. Two properties carry the whole contract, and a future edit that flips
 * either would silently change delivery semantics:
 *
 * <ul>
 *   <li><strong>republish-outstanding-events-on-restart</strong> — the only retry mechanism. Off, a
 *       send lost to a crash is lost permanently.</li>
 *   <li><strong>completion-mode = archive</strong> — a bounded live table. Under the default
 *       ({@code UPDATE}) completed publications accumulate in {@code event_publication} forever, and
 *       the outbox-backlog gauge in {@code ObservabilityConfig} — which reads that table as
 *       "undelivered work" — would climb with healthy traffic and stop meaning anything.</li>
 * </ul>
 *
 * <p>The archive half is asserted behaviourally rather than by reading the property back: a
 * completed publication must have <em>left</em> the live table. Testcontainers; skipped where Docker
 * is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EventRegistryDurabilityIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	/** Improbable enough to identify this test's publication in a database other ITs also write to. */
	private static final long DISTINCTIVE_AMOUNT_MINOR = 987_654_321L;

	@Autowired
	Environment environment;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	/**
	 * Publications of <em>this test's</em> event, keyed on its deliberately-improbable amount rather than
	 * on the booking id: ids are small integers, and every {@code BookingConfirmed} payload in the shared
	 * database also carries {@code venueId}/{@code setId}/{@code amountMinor}, so a bare
	 * {@code LIKE '%<id>%'} would match other tests' rows — making the archive assertion pass for the
	 * wrong reason and the live-table assertion fail for one. The assertions run archive-first, so a
	 * pattern that matched nothing would fail loudly rather than pass vacuously.
	 */
	private long publicationsIn(String table) {
		return jdbc.sql("SELECT COUNT(*) FROM " + table
						+ " WHERE event_type = :type AND serialized_event LIKE :amountFragment")
				.param("type", BookingConfirmed.class.getName())
				.param("amountFragment", "%" + DISTINCTIVE_AMOUNT_MINOR + "%")
				.query(Long.class).single();
	}

	@Test
	void republishesOutstandingPublicationsOnRestart() {
		assertThat(environment.getProperty("spring.modulith.events.republish-outstanding-events-on-restart"))
				.as("the only retry mechanism behind every registry-borne email (#371, #373, #374)")
				.isEqualTo("true");
	}

	@Test
	void boundsTheLivePublicationTableByArchivingCompletions() {
		assertThat(environment.getProperty("spring.modulith.events.completion-mode"))
				.as("a bounded completion mode — DELETE or ARCHIVE, never the accumulating default")
				.isEqualTo("archive");

		var set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		LocalDate date = LocalDate.of(2029, 5, 5);
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('archive-me@example.com', 'Archive Guest', '+355780') RETURNING id")
				.query(Long.class).single();
		long bookingId = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES ('ARCHIVE1', :venue, :set, :cust, :date, :amount, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("venue", set[1]).param("set", set[0]).param("cust", customerId)
				.param("date", date).param("amount", DISTINCTIVE_AMOUNT_MINOR)
				.query(Long.class).single();

		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(
				new BookingConfirmed(new BookingId(bookingId), new VenueId(set[1]), new SetId(set[0]),
						date, DISTINCTIVE_AMOUNT_MINOR, "EUR")));

		Awaitility.await().atMost(WAIT)
				.until(() -> publicationsIn("event_publication_archive") > 0);
		Awaitility.await().atMost(WAIT)
				.until(() -> publicationsIn("event_publication") == 0);
	}
}
