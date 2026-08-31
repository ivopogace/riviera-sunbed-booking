package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import io.micrometer.core.instrument.MeterRegistry;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.shared.ObservabilityMetrics;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The accepted request's payment-due email end-to-end — the {@code notification}
 * listener on {@code BookingPaymentDue}, through the Event Publication Registry, to the recording
 * {@link MockMailer}.
 *
 * <p>The publication branch — that the event is raised only where money is genuinely owed, and never
 * on a decline, a stub-confirmed accept or a reverted one — belongs to {@code booking} and is pinned
 * at that seam by {@code RespondToRequestServiceTest}. What is left for this class is everything
 * downstream of the fact: that the mail carries the deadline and a working pay link, that the
 * registry's contract holds, that suppression is honoured without parking the publication, and that
 * a fact that cannot be resolved is abandoned loudly rather than silently.
 *
 * <p><strong>Dates are unique to this class, deliberately.</strong> Classes sharing this context
 * share one container and one online set, and a claimed {@code (set, date)} is never released
 * (invariant #2). {@code BookingConfirmationMailIT} sits on 2029-06-xx and
 * {@code BookingCancellationMailIT} on 2029-07-xx; this class takes 2029-08-xx. The amounts are
 * likewise its own, because {@code BookingMailFixtures} matches publications on the amount fragment.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RequestPaymentDueMailIT {

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

	@Autowired
	IncompleteEventPublications incompletePublications;

	private BookingMailFixtures fixtures;

	private record SetRef(long setId, long venueId, String venueName) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	/**
	 * AC-5. The two things this mail exists to carry are the deadline and a way to act on it, so both
	 * are asserted as values rather than as "the mail was sent": the {@code payBy} is the one off the
	 * event, unrounded and unrecomputed, and the link is the code-gated view for <em>this</em> booking.
	 *
	 * <p>The instant is truncated to milliseconds before publishing because the registry round-trips
	 * the payload through JSON — asserting on a nanosecond-precision instant would fail on
	 * serialization precision rather than on anything this slice decides.
	 */
	@Test
	void mailsThePaymentDeadlineAndPayLink() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 11);
		String guest = "pay-me@example.com";
		Instant payBy = Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS);

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"PAYDUE01", date, guest, 8311L, "AWAITING_PAYMENT");
		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 8311L, payBy));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.PAYMENT_DUE);
		assertThat(sent.paymentDue().payBy()).as("the deadline the sweep enforces, not a recomputed one")
				.isEqualTo(payBy);
		assertThat(sent.paymentDue().bookingCode()).isEqualTo("PAYDUE01");
		assertThat(sent.paymentDue().venueName()).isEqualTo(set.venueName());
		assertThat(sent.paymentDue().bookingDate()).isEqualTo(date);
		assertThat(sent.paymentDue().amountMinor()).isEqualTo(8311L);
		assertThat(sent.paymentDue().currency()).isEqualTo("EUR");
		assertThat(sent.paymentDue().payLink()).isEqualTo(links.forBooking("PAYDUE01"));
		assertThat(sent.paymentDue().payLink().toString())
				.as("the code-gated view, which is where an AWAITING_PAYMENT booking offers Pay now")
				.endsWith("/booking/PAYDUE01");
	}

	/**
	 * AC-4. A decline publishes nothing at all, so the assertion that matters is about <em>silence</em>
	 * — and silence is only meaningful against a context that demonstrably does mail: this seeds a
	 * declined booking, publishes nothing for it, and asserts the outbox stays empty for that guest
	 * while the sibling test proves the same wiring delivers.
	 */
	@Test
	void declineMailsNothing() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 12);
		String guest = "declined@example.com";

		fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"DECLINE1", date, guest, 8312L, "DECLINED");

		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> mailer.lastTo(guest).isEmpty());
	}

	/**
	 * AC-7 — the whole idempotency story, since there is deliberately no dedupe table: the registry
	 * completes the publication on the listener's normal return, and only NULL-{@code completion_date}
	 * rows are resubmitted. This is what {@code republish-outstanding-events-on-restart} does at boot.
	 */
	@Test
	void resubmissionProducesNoSecondMail() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 13);
		String guest = "replay-pay@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"REPLAYP1", date, guest, 8313L, "AWAITING_PAYMENT");
		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 8313L,
				Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS)));
		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		incompletePublications.resubmitIncompletePublications(publication -> true);

		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT).until(() -> countTo(guest) == 1L);
	}

	/**
	 * AC-9. The skip must leave <em>no</em> outstanding publication: on this vehicle a throw would park
	 * the row in a retry loop against an address the policy keeps refusing (R-6). Archive mode moves
	 * completed rows out, so "no outstanding row" is how a completed skip reads.
	 */
	@Test
	void suppressedAddressIsSkippedAndCompletes() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 14);
		String suppressed = "suppressed-pay@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"SUPPPAY1", date, suppressed, 8314L, "AWAITING_PAYMENT");
		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 8314L,
				Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS)));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsFor(
				BookingMailFixtures.PAYMENT_DUE_LISTENER_ID, 8314L) == 0L);
		assertThat(countTo(suppressed)).isZero();
	}

	/**
	 * AC-10. A booking id nothing resolves is not reachable through any application path — the row is
	 * FK-protected and never hard-deleted — so this publishes one directly to reach the branch. Both
	 * halves of the accounting are asserted, because each answers a question the other cannot: the
	 * counter is what an alert watches, and the publication completing is what says the listener chose
	 * to give up rather than failing and leaving a retry behind.
	 */
	@Test
	void abandonsAndCountsAMissingFact() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 15);
		double before = abandonedCount();

		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), 987_654_321L, date, 8315L,
				Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS)));

		Awaitility.await().atMost(WAIT).until(() -> abandonedCount() == before + 1);
		assertThat(fixtures.outstandingPublicationsFor(
				BookingMailFixtures.PAYMENT_DUE_LISTENER_ID, 8315L))
				.as("abandoning completes the publication — the fact cannot appear later")
				.isZero();
	}

	/**
	 * AC-9 (the re-drive's live half). {@code MailOutboxScopeTest} pins the module prefix; this pins
	 * the constant against the id the running registry actually writes, so the admin re-drive cannot
	 * silently skip this kind. Read from the archive, because a delivered mail's row is moved there the
	 * moment the listener returns.
	 */
	@Test
	void theRegistryWritesTheListenerIdTheReDriveScopesOn() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 16);
		String guest = "listener-id-pay@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"LISTIDP1", date, guest, 8316L, "AWAITING_PAYMENT");
		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 8316L,
				Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS)));
		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		assertThat(jdbc.sql("SELECT DISTINCT listener_id FROM event_publication_archive "
						+ "WHERE serialized_event LIKE :fragment AND listener_id LIKE :module")
				.param("fragment", "%8316%")
				.param("module", "ai.riviera.platform.notification.%")
				.query(String.class).list())
				.containsExactly(BookingMailFixtures.PAYMENT_DUE_LISTENER_ID);
	}

	/**
	 * #795 AC-6: a same-day request accepted before the venue's sales close is disclosed as a
	 * non-refundable last-minute booking in its payment-due mail. The CLOSED-stamped event is
	 * published directly; {@code RespondToRequestServiceTest} pins the accept-path stamping.
	 */
	@Test
	void sameDayAcceptCarriesNonRefundableDisclosure() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 8, 17);
		String guest = "same-day-pay@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"PAYSAME1", date, guest, 8317L, "AWAITING_PAYMENT");
		fixtures.publishInTransaction(fixtures.paymentDueOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 8317L,
				Instant.now().plus(Duration.ofHours(6)).truncatedTo(ChronoUnit.MILLIS),
				CancellationWindow.CLOSED, 0));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);
		assertThat(mailer.lastTo(guest).orElseThrow().paymentDue().cancellationWindowAtBirth())
				.isEqualTo(CancellationWindow.CLOSED);
	}

	private double abandonedCount() {
		return meters.find(ObservabilityMetrics.MAIL_PAYMENT_DUE_ABANDONED).counters().stream()
				.mapToDouble(counter -> counter.count()).sum();
	}

	private SetRef onlineSet() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' ORDER BY sp.id LIMIT 1
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"), rs.getString("name")))
				.single();
	}

	private long countTo(String email) {
		return mailer.sent().stream()
				.filter(e -> e.kind() == SentEmail.Kind.PAYMENT_DUE)
				.filter(e -> e.toEmail().equals(email))
				.count();
	}
}
