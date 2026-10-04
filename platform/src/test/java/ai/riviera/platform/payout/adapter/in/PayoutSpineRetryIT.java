package ai.riviera.platform.payout.adapter.in;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.BookingMailFixtures;
import ai.riviera.platform.notification.BookingMailFixtures.SetRef;
import ai.riviera.platform.notification.ControllableMailerConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The spine retry against the real registry (#1340): a FAILED payout accrual is re-driven and accrues
 * once, while a FAILED confirmation mail for the same event stays outstanding. Both rows are the
 * registry's own, lifted back from the archive as {@code MailOutboxScopeIT} does, and aged past the
 * minimum age so only the scope decides.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
class PayoutSpineRetryIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	private static final long AMOUNT_MINOR = 1_340_000_701L;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	PayoutSpineRetry retry;

	@Test
	void reDrivesAFailedAccrualAndLeavesAFailedMailAlone() {
		BookingMailFixtures fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
		SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2032, 8, 3);
		long bookingId = fixtures.seedBooking(set, "SPINE001", date, "spine-retry@example.com", AMOUNT_MINOR,
				"CONFIRMED");

		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, AMOUNT_MINOR));
		Awaitility.await("the accrual and the mail ran, so both publications are archived").atMost(WAIT)
				.until(() -> accrualsFor(bookingId) == 1L
						&& archived("payout.accrue-on-booking-confirmed") != null
						&& archived(BookingMailFixtures.LISTENER_ID) != null);

		UUID failedAccrual = reopenAsFailed(archived("payout.accrue-on-booking-confirmed"));
		UUID failedMail = reopenAsFailed(archived(BookingMailFixtures.LISTENER_ID));
		jdbc.sql("DELETE FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).update();

		try {
			retry.sweep();

			Awaitility.await("the failed accrual was re-driven and completed").atMost(WAIT)
					.until(() -> accrualsFor(bookingId) == 1L && !isOutstanding(failedAccrual));
			assertThat(isOutstanding(failedMail)).as("a mail is never auto-retried (#1340)").isTrue();
		}
		finally {
			jdbc.sql("DELETE FROM event_publication WHERE id IN (:ids)")
					.param("ids", List.of(failedAccrual, failedMail)).update();
		}
	}

	private UUID archived(String listenerId) {
		return jdbc.sql("""
				SELECT id FROM event_publication_archive
				WHERE listener_id = :listener AND event_type = :type AND serialized_event LIKE :amount
				""")
				.param("listener", listenerId).param("type", BookingConfirmed.class.getName())
				.param("amount", "%" + AMOUNT_MINOR + "%")
				.query(UUID.class).optional().orElse(null);
	}

	/** The registry's own row back in the live table, FAILED once and an hour old. */
	private UUID reopenAsFailed(UUID archivedId) {
		return jdbc.sql("""
				INSERT INTO event_publication
				    (id, listener_id, event_type, serialized_event, publication_date, status, completion_attempts)
				SELECT gen_random_uuid(), listener_id, event_type, serialized_event,
				       now() - interval '1 hour', 'FAILED', 1
				FROM event_publication_archive WHERE id = :id
				RETURNING id
				""")
				.param("id", archivedId).query(UUID.class).single();
	}

	private boolean isOutstanding(UUID publicationId) {
		return jdbc.sql("SELECT COUNT(*) FROM event_publication WHERE id = :id AND completion_date IS NULL")
				.param("id", publicationId).query(Long.class).single() == 1L;
	}

	private long accrualsFor(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}
}
