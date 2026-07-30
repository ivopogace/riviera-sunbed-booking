package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;
import java.util.UUID;

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
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.ConfirmationMailFixtures.SetRef;
import ai.riviera.platform.notification.application.MailOutbox;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The guarantee that makes #405's admin lever safe: <strong>a button labelled "mail" cannot move
 * money</strong> (AC-2), and it never redelivers a mail already delivered (AC-5).
 *
 * <p><strong>Why this needs a real database.</strong> {@code MailOutboxScopeTest} already proves the
 * predicate rejects the money-path listener ids, but a predicate that is right about strings is not
 * the claim worth making. What matters is that the framework, driven through the real registry with a
 * genuinely outstanding accrual in it, invokes the confirmation listener and <em>not</em>
 * {@code BookingConfirmedPayoutListener} — so the assertion is the absence of a ledger entry
 * (invariant #9), not the absence of a match.
 *
 * <p><strong>The outstanding accrual is framework-authored, not hand-built.</strong> The listener has
 * no failure mode a test can reach on demand, so the fixture lets a real confirmation accrue, then
 * lifts that publication's own archived row back into the live table — marked {@code FAILED}, which is
 * what a listener that threw leaves behind — and clears the ledger entry it wrote. Nothing about the
 * row is guessed: not the listener id, not the serialization, not the event type. That matters because
 * each of those, written by hand and subtly wrong, yields a row the registry silently skips and
 * therefore a test that passes for the wrong reason. Two drafts of this test did exactly that — the
 * second because it left {@code status} NULL, and this deployment's v2 repository claims a publication
 * with {@code UPDATE … WHERE ID = ? AND STATUS != 'RESUBMITTED'}, which no NULL ever satisfies.
 *
 * <p><strong>The control is the load-bearing half.</strong> "Nothing happened to that row" is exactly
 * what a dead row looks like too. So the test ends by resubmitting the same row through an
 * <em>unscoped</em> predicate and asserting the accrual does reappear: the row is live, the listener
 * is reachable, and the only thing that stood between them was the scope.
 *
 * <p><strong>Driving the port, not the endpoint.</strong> The subject is the scope, so these tests
 * call {@link MailOutbox} directly. Going through {@code MailResubmission} would drag in the cooldown
 * — which starts at context construction and would refuse the first call — and that policy already
 * has its own tests against a controllable clock.
 *
 * <p>The database is shared with other IT classes in this context, so every assertion is keyed to
 * this test's own booking or publication id rather than to a global count; the distinct amounts below
 * exist to make those rows identifiable. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
class MailOutboxScopeIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/** Improbable enough to identify one test's rows in a database several IT classes write to. */
	private static final long MAIL_AMOUNT_MINOR = 405_000_801L;

	private static final long ACCRUAL_AMOUNT_MINOR = 405_000_802L;

	private static final long COMPLETED_AMOUNT_MINOR = 405_000_803L;

	@Autowired
	ControllableMailer transport;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	@Autowired
	MailOutbox outbox;

	private ConfirmationMailFixtures fixtures;

	@BeforeEach
	void resetTransport() {
		fixtures = new ConfirmationMailFixtures(jdbc, txManager, publisher);
		transport.reset();
	}

	/**
	 * AC-2. One outstanding confirmation mail and one outstanding payout accrual sit in the registry at
	 * the same time — the shape #405 describes, and the reason the scope exists. The mail is re-driven;
	 * the accrual is not, and no ledger entry appears for its booking.
	 */
	@Test
	void resubmitsMailWithoutTouchingTheMoneyPath() {
		SetRef set = fixtures.onlineSet();
		LocalDate accrualDate = LocalDate.of(2032, 6, 5);
		long accrualBooking = fixtures.seedBooking(set, "SCOPEPAY", accrualDate, "scope-payout@example.com",
				ACCRUAL_AMOUNT_MINOR, "CONFIRMED");

		fixtures.publishInTransaction(fixtures.confirmationOf(set, accrualBooking, accrualDate, ACCRUAL_AMOUNT_MINOR));
		Awaitility.await("the accrual ran, so its publication is completed and archived").atMost(WAIT)
				.until(() -> accrualsFor(accrualBooking) == 1L && archivedAccrual() != null);

		UUID stuckAccrual = reopenArchivedAccrual(archivedAccrual());
		clearAccrual(accrualBooking);

		LocalDate mailDate = LocalDate.of(2032, 6, 7);
		String contact = "scope-mail@example.com";
		long mailBooking = fixtures.seedBooking(set, "SCOPEML1", mailDate, contact, MAIL_AMOUNT_MINOR, "CONFIRMED");
		transport.failEverySend(true);
		fixtures.publishInTransaction(fixtures.confirmationOf(set, mailBooking, mailDate, MAIL_AMOUNT_MINOR));
		Awaitility.await("the failing send left the mail publication outstanding").atMost(WAIT)
				.until(() -> fixtures.outstandingMailPublications(MAIL_AMOUNT_MINOR) == 1L);

		transport.reset();
		int resubmitted = outbox.resubmitOutstanding();

		Awaitility.await("the mail was re-driven").atMost(WAIT)
				.until(() -> transport.attemptsMatching(contact) >= 1);
		assertThat(resubmitted).as("the mail publication was in scope").isPositive();
		assertThat(isOutstanding(stuckAccrual))
				.as("a stuck accrual must not be resubmitted by the mail lever (invariant #9)")
				.isTrue();
		assertThat(accrualsFor(accrualBooking))
				.as("the payout listener was never invoked, so no ledger entry was written")
				.isZero();

		resubmitUnscoped(accrualBooking);

		Awaitility.await("the control proves that row was live all along").atMost(WAIT)
				.until(() -> accrualsFor(accrualBooking) == 1L);
	}

	/**
	 * AC-5. A publication the registry has already completed is archived out of
	 * {@code event_publication} under {@code completion-mode=archive}, so it is not merely filtered —
	 * it is not there. Pressing the lever afterwards produces no second mail, which is the guarantee
	 * {@code BookingConfirmationMailIT} makes for the restart republication, restated for this one.
	 */
	@Test
	void leavesCompletedPublicationsAlone() {
		SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2032, 7, 6);
		String contact = "scope-delivered@example.com";
		long bookingId = fixtures.seedBooking(set, "SCOPEDLV", date, contact, COMPLETED_AMOUNT_MINOR, "CONFIRMED");

		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, COMPLETED_AMOUNT_MINOR));
		Awaitility.await("the mail was delivered and its publication completed").atMost(WAIT)
				.until(() -> transport.deliveriesMatching(contact) == 1L
						&& fixtures.outstandingMailPublications(COMPLETED_AMOUNT_MINOR) == 0L);

		outbox.resubmitOutstanding();

		assertThat(transport.deliveriesMatching(contact))
				.as("a completed publication is archived out of the live table — nothing to redeliver")
				.isEqualTo(1L);
	}

	/** This test's archived payout-accrual publication, or {@code null} until the accrual completes. */
	private UUID archivedAccrual() {
		return jdbc.sql("""
				SELECT id FROM event_publication_archive
				WHERE listener_id LIKE '%BookingConfirmedPayoutListener%'
				  AND serialized_event LIKE :amountFragment
				""")
				.param("amountFragment", "%" + ACCRUAL_AMOUNT_MINOR + "%")
				.query(UUID.class).optional().orElse(null);
	}

	/**
	 * Copies an archived publication back into the live table under a fresh id — the registry's own
	 * row, verbatim, minus its completion. Done in SQL so no listener id, event type or serialization
	 * is restated in Java: a hand-built row the registry silently skips is indistinguishable from the
	 * scope working, which is precisely the false green this fixture exists to avoid.
	 */
	private UUID reopenArchivedAccrual(UUID archivedId) {
		return jdbc.sql("""
				INSERT INTO event_publication
				    (id, listener_id, event_type, serialized_event, publication_date, status, completion_attempts)
				SELECT gen_random_uuid(), listener_id, event_type, serialized_event, publication_date, 'FAILED', 1
				FROM event_publication_archive WHERE id = :id
				RETURNING id
				""")
				.param("id", archivedId).query(UUID.class).single();
	}

	/** The control: the same row, re-driven with the scope removed but narrowed to this test's booking. */
	private void resubmitUnscoped(long bookingId) {
		incompletePublications.resubmitIncompletePublications(publication -> publication
				.getEvent() instanceof BookingConfirmed confirmed
				&& confirmed.bookingId().value() == bookingId);
	}

	private void clearAccrual(long bookingId) {
		jdbc.sql("DELETE FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).update();
	}

	private boolean isOutstanding(UUID publicationId) {
		return jdbc.sql("SELECT COUNT(*) FROM event_publication WHERE id = :id AND completion_date IS NULL")
				.param("id", publicationId).query(Long.class).single() == 1L;
	}

	private long accrualsFor(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}
}
