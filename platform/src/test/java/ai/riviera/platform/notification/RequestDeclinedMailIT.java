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
 * The declined request's record email end-to-end (#124) — the {@code notification} listener on
 * {@code BookingRequestDeclined}, through the Event Publication Registry, to the recording
 * {@link MockMailer}. The publication branch — that the fact is raised only by the winning decline
 * leg, and never by withdraw or a lost race — belongs to {@code booking} and is pinned there by
 * {@code RequestTerminationEventPublicationIT}; what is left here is everything downstream: the
 * plain record's fields and status link, suppression honoured without parking the publication, and
 * a fact that cannot be resolved abandoned loudly under this flow's own counter.
 *
 * <p><strong>Dates are unique to this class</strong> (2029-09-xx; the sibling ITs hold 06/07/08
 * and the expiry IT 10) — and each test's date is also unique <em>within</em> the class, because
 * with no amount on this payload the date is the fragment publications are matched on.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RequestDeclinedMailIT {

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

	/**
	 * AC-4. A plain record only (the 2026-08-01 product decision): the outcome, the booking's facts,
	 * and the code-gated status link built at send time — no CTA, and the link comes from
	 * {@code BookingLinks}, never the payload.
	 */
	@Test
	void mailsTheDeclineRecordWithTheStatusLink() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 9, 11);
		String guest = "declined-guest@example.com";

		long bookingId = fixtures.seedBooking(set, "DECMAIL1", date, guest, 9911L, "DECLINED");
		fixtures.publishInTransaction(fixtures.requestDeclinedOf(set, bookingId, date));

		Awaitility.await().atMost(WAIT).until(() -> mailer.lastTo(guest).isPresent());

		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.REQUEST_DECLINED);
		assertThat(sent.requestDeclined().bookingCode()).isEqualTo("DECMAIL1");
		assertThat(sent.requestDeclined().bookingDate()).isEqualTo(date);
		assertThat(sent.requestDeclined().statusLink()).isEqualTo(links.forBooking("DECMAIL1"));
		assertThat(sent.requestDeclined().statusLink().toString())
				.as("the code-gated view, which renders the DECLINED state")
				.endsWith("/booking/DECMAIL1");
	}

	/**
	 * AC-5. The skip must leave <em>no</em> outstanding publication: on this vehicle a throw would
	 * park the row in a retry loop against an address the policy keeps refusing.
	 */
	@Test
	void suppressedAddressIsSkippedAndCompletes() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 9, 12);
		String suppressed = "suppressed-decline@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());

		long bookingId = fixtures.seedBooking(set, "SUPPDEC1", date, suppressed, 9912L, "DECLINED");
		fixtures.publishInTransaction(fixtures.requestDeclinedOf(set, bookingId, date));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.REQUEST_DECLINED_LISTENER_ID, date.toString()) == 0L);
		assertThat(mailer.lastTo(suppressed)).isEmpty();
	}

	/**
	 * AC-6. A booking id nothing resolves is unreachable through any application path, so this
	 * publishes one directly. Both halves of the accounting are asserted: the counter (what an alert
	 * watches, under this flow's own name) and the completed publication (the listener chose to give
	 * up — the fact cannot appear later, so nothing may retry).
	 */
	@Test
	void abandonsAndCountsAMissingFact() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 9, 13);
		double before = abandonedCount();

		fixtures.publishInTransaction(fixtures.requestDeclinedOf(set, 987_654_321L, date));

		Awaitility.await().atMost(WAIT).until(() -> abandonedCount() == before + 1);
		assertThat(fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.REQUEST_DECLINED_LISTENER_ID, date.toString()))
				.as("abandoning completes the publication — the fact cannot appear later")
				.isZero();
	}

	/** The #405 re-drive scopes on the listener id the running registry actually writes — pin it. */
	@Test
	void theRegistryWritesTheListenerIdTheReDriveScopesOn() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2029, 9, 14);
		String guest = "listener-id-decline@example.com";

		long bookingId = fixtures.seedBooking(set, "LISTIDD1", date, guest, 9914L, "DECLINED");
		fixtures.publishInTransaction(fixtures.requestDeclinedOf(set, bookingId, date));
		Awaitility.await().atMost(WAIT).until(() -> mailer.lastTo(guest).isPresent());

		assertThat(jdbc.sql("SELECT DISTINCT listener_id FROM event_publication_archive "
						+ "WHERE serialized_event LIKE :fragment AND listener_id LIKE :module")
				.param("fragment", "%" + date + "%")
				.param("module", "ai.riviera.platform.notification.%")
				.query(String.class).list())
				.containsExactly(BookingMailFixtures.REQUEST_DECLINED_LISTENER_ID);
	}

	private double abandonedCount() {
		return meters.find(ObservabilityMetrics.MAIL_REQUEST_DECLINED_ABANDONED).counters().stream()
				.mapToDouble(counter -> counter.count()).sum();
	}
}
