package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The registry vehicle's bulkhead (#383): a degraded relay must be unable to consume resources the
 * money-path spine needs. The listener runs on Boot's shared {@code applicationTaskExecutor} (8
 * threads, unbounded queue) and, until this slice, inside {@code @Transactional(REQUIRES_NEW)} — so a
 * blocking SMTP round-trip pinned both a spine thread and one of Hikari's stock 10 connections for
 * its whole duration.
 *
 * <p>This class replaces the transport with a probe rather than timing a real one: the configured
 * SMTP timeouts are <em>per socket operation</em>, not a session ceiling, so any duration-based
 * assertion would be both slow and wrong.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ConfirmationMailBulkheadIT.ProbeMailerConfiguration.class })
@SpringBootTest
class ConfirmationMailBulkheadIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	/**
	 * A date no other IT books. Classes sharing this context key share one container, and a claimed
	 * {@code (set, date)} is never released (invariant #2).
	 */
	private static final LocalDate BOOKING_DATE = LocalDate.of(2031, 3, 17);

	private static final String BOOKING_CONFIRMED = "ai.riviera.platform.booking.events.BookingConfirmed";

	/** Frozen: the registry stores this string, so the class, package and signature cannot move. */
	private static final String EXPECTED_LISTENER_ID =
			"ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener"
					+ ".on(ai.riviera.platform.booking.events.BookingConfirmed)";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ProbeMailer probe;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@BeforeEach
	void rearmProbe() {
		probe.reset();
	}

	/**
	 * AC-2 — the transport must not run inside a transaction. The listener writes nothing, so the
	 * transaction bought only a Hikari connection held across a third-party network call.
	 */
	@Test
	void theSendHoldsNoTransactionAndNoConnection() throws Exception {
		publishConfirmedBooking("BULKHD0", BOOKING_DATE, "bulkhead-tx@example.com");

		assertThat(probe.awaitSend(WAIT)).as("the confirmation mail never reached the transport").isTrue();
		assertThat(probe.transactionActive())
				.as("the SMTP call must not run inside a transaction").isFalse();
		assertThat(probe.connectionBound())
				.as("the SMTP call must hold no pooled connection").isFalse();
	}

	/**
	 * AC-5 — the registry keys a publication on the listener's FQ method signature, so decomposing
	 * {@code @ApplicationModuleListener} into its parts must not move it: a changed id orphans every
	 * outstanding row, which is what V18 and V31 had to repair. Read from the archive because a
	 * successful publication is moved there by {@code completion-mode=archive}.
	 */
	@Test
	void decompositionKeepsTheRegistryListenerId() throws Exception {
		publishConfirmedBooking("BULKHD1", BOOKING_DATE.plusDays(1), "bulkhead-id@example.com");
		assertThat(probe.awaitSend(WAIT)).as("the confirmation mail never reached the transport").isTrue();

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertThat(listenerIdsFor(BOOKING_CONFIRMED))
				.as("the registry must still track this listener under its pre-decomposition id")
				.contains(EXPECTED_LISTENER_ID));
	}

	private List<String> listenerIdsFor(String eventType) {
		return jdbc.sql("""
				SELECT listener_id FROM event_publication_archive WHERE event_type = :type
				UNION ALL
				SELECT listener_id FROM event_publication WHERE event_type = :type
				""")
				.param("type", eventType).query(String.class).list();
	}

	private void publishConfirmedBooking(String code, LocalDate date, String contactEmail) {
		SetRef set = onlineSet();
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Bulkhead Guest', '+355777') RETURNING id")
				.param("e", contactEmail).query(Long.class).single();
		long bookingId = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4200, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", date)
				.query(Long.class).single();

		// Publish inside a transaction so the AFTER_COMMIT registry-backed listener is triggered.
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(
				new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
						new SetId(set.setId()), date, 4200L, "EUR")));
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id")))
				.single();
	}

	private record SetRef(long setId, long venueId) {
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class ProbeMailerConfiguration {

		@Bean
		@Primary
		ProbeMailer probeMailer(DataSource dataSource) {
			return new ProbeMailer(dataSource);
		}
	}

	/**
	 * Records the transactional context the transport is called in. Deliberately not a mock: the
	 * assertion is about the caller's thread state at the moment of the send, which only real
	 * in-transport code can observe.
	 */
	static final class ProbeMailer implements Mailer {

		private final DataSource dataSource;

		private volatile CountDownLatch sent = new CountDownLatch(1);
		private volatile boolean transactionActive = true;
		private volatile boolean connectionBound = true;

		ProbeMailer(DataSource dataSource) {
			this.dataSource = dataSource;
		}

		/** The bean is a context singleton, so each test re-arms the latch and the recorded state. */
		void reset() {
			sent = new CountDownLatch(1);
			transactionActive = true;
			connectionBound = true;
		}

		@Override
		public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
			transactionActive = TransactionSynchronizationManager.isActualTransactionActive();
			connectionBound = TransactionSynchronizationManager.hasResource(dataSource);
			sent.countDown();
		}

		@Override
		public void sendEmailVerification(String toEmail, URI verificationLink) {
		}

		@Override
		public void sendPasswordReset(String toEmail, URI resetLink) {
		}

		boolean awaitSend(Duration timeout) throws InterruptedException {
			return sent.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
		}

		boolean transactionActive() {
			return transactionActive;
		}

		boolean connectionBound() {
			return connectionBound;
		}
	}
}
