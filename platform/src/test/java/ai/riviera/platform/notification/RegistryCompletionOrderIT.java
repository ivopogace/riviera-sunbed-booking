package ai.riviera.platform.notification;

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
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.RegistryRows;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingRequestExpired;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The registry archives a mail publication only after its send returns, never while it is in flight (#1465):
 * {@code @Async} wraps Modulith's completion advisor, so completion runs on the mail thread. ADR-0011's
 * at-least-once and the mail re-drive's skip of archived rows rest on that order; an advisor reorder fails here.
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
class RegistryCompletionOrderIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	/** Long enough for a completion registered on the publishing thread to have landed. */
	private static final Duration WEDGED = Duration.ofSeconds(3);

	@Autowired
	ControllableMailer transport;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private BookingMailFixtures fixtures;

	@BeforeEach
	void resetTransport() {
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
		transport.reset();
	}

	/** Unconditional, so a failure while wedged never hands a parked mail thread to this context's next class. */
	@AfterEach
	void releaseTransport() {
		transport.release();
	}

	@Test
	void aPublicationStaysLiveWhileItsSendIsInFlight() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2033, 1, 14);
		String guest = "completion-order@example.com";
		long bookingId = fixtures.seedBooking(set, "CMPLORD1", date, guest, 33_014L, "EXPIRED");
		transport.block();

		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));

		Awaitility.await().atMost(WAIT).until(() -> transport.attemptsMatching(guest) == 1);
		Awaitility.await().during(WEDGED).atMost(WEDGED.plusSeconds(2)).until(() -> archived(bookingId) == 0L);
		assertThat(liveStatus(bookingId)).as("the live row while its send is wedged").isEqualTo("PROCESSING");

		transport.release();

		Awaitility.await().atMost(WAIT).until(() -> archived(bookingId) == 1L);
		assertThat(transport.deliveriesMatching(guest)).isEqualTo(1L);
	}

	private long archived(long bookingId) {
		return jdbc.sql("SELECT count(*) FROM event_publication_archive "
						+ "WHERE event_type = :type AND listener_id = :listener AND " + RegistryRows.NAMES_BOOKING)
				.param("type", BookingRequestExpired.class.getName())
				.param("listener", BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID)
				.param("bookingId", RegistryRows.bookingIdParam(bookingId))
				.query(Long.class).single();
	}

	private String liveStatus(long bookingId) {
		return jdbc.sql("SELECT status FROM event_publication WHERE event_type = :type AND listener_id = :listener "
						+ "AND completion_date IS NULL AND " + RegistryRows.NAMES_BOOKING)
				.param("type", BookingRequestExpired.class.getName())
				.param("listener", BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID)
				.param("bookingId", RegistryRows.bookingIdParam(bookingId))
				.query(String.class).single();
	}
}
