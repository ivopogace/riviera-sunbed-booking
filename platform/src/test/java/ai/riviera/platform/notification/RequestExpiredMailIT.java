package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

import io.micrometer.core.instrument.MeterRegistry;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.shared.ObservabilityMetrics;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The expired request's record email end-to-end — {@link RequestDeclinedMailIT}'s mirror for
 * the sweep's fact, {@code BookingRequestExpired}, and everything its class Javadoc argues applies
 * unchanged. The one behavioural difference lives upstream and is pinned in {@code booking}: a
 * clean sweep publishes nothing, so a clean sweep also mails nothing.
 *
 * <p><strong>Dates are unique to this class</strong> (2029-10-xx), and unique per test within it —
 * the date is the fragment publications are matched on, this payload carrying no amount.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RequestExpiredMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	BookingLinks links;

	@Autowired
	MeterRegistry meters;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private BookingMailFixtures fixtures;

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	/** AC-4: the plain record — outcome, facts, the code-gated status link built at send time. */
	@Test
	void mailsTheExpiryRecordWithTheStatusLink() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 10, 11);
		String guest = "expired-guest@example.com";

		long bookingId = fixtures.seedBooking(set, "EXPMAIL1", date, guest, 10_011L, "EXPIRED");
		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));

		Awaitility.await().atMost(WAIT).until(() -> mailer.lastTo(guest).isPresent());

		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.REQUEST_EXPIRED);
		assertThat(sent.requestExpired().bookingCode()).isEqualTo("EXPMAIL1");
		assertThat(sent.requestExpired().bookingDate()).isEqualTo(date);
		assertThat(sent.requestExpired().statusLink()).isEqualTo(links.forBooking("EXPMAIL1"));
		assertThat(sent.requestExpired().statusLink().toString())
				.as("the code-gated view, which renders the EXPIRED state")
				.endsWith("/booking/EXPMAIL1");
	}

	/** AC-5: the skip completes the publication — no retry loop against a refused address. */
	@Test
	void suppressedAddressIsSkippedAndCompletes() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 10, 12);
		String suppressed = "suppressed-expiry@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());

		long bookingId = fixtures.seedBooking(set, "SUPPEXP1", date, suppressed, 10_012L, "EXPIRED");
		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID, date.toString()) == 0L);
		assertThat(mailer.lastTo(suppressed)).isEmpty();
	}

	/** AC-6: the give-up is counted under this flow's own name and completes the publication. */
	@Test
	void abandonsAndCountsAMissingFact() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 10, 13);
		double before = abandonedCount();

		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, 987_654_322L, date));

		Awaitility.await().atMost(WAIT).until(() -> abandonedCount() == before + 1);
		assertThat(fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID, date.toString()))
				.as("abandoning completes the publication — the fact cannot appear later")
				.isZero();
	}

	/** The admin re-drive scopes on the listener id the running registry actually writes — pin it. */
	@Test
	void theRegistryWritesTheListenerIdTheReDriveScopesOn() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 10, 14);
		String guest = "listener-id-expiry@example.com";

		long bookingId = fixtures.seedBooking(set, "LISTIDE1", date, guest, 10_014L, "EXPIRED");
		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));
		Awaitility.await().atMost(WAIT).until(() -> mailer.lastTo(guest).isPresent());

		assertThat(jdbc.sql("SELECT DISTINCT listener_id FROM event_publication_archive "
						+ "WHERE serialized_event LIKE :fragment AND listener_id LIKE :module")
				.param("fragment", "%" + date + "%")
				.param("module", "ai.riviera.platform.notification.%")
				.query(String.class).list())
				.containsExactly(BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID);
	}

	private double abandonedCount() {
		return meters.find(ObservabilityMetrics.MAIL_REQUEST_EXPIRED_ABANDONED).counters().stream()
				.mapToDouble(counter -> counter.count()).sum();
	}
}
