package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;

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
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.booking.vocabulary.RefundReason;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code BookingDayRefunded} → one refunded-day mail through the registry vehicle (issue #1210): the
 * booking's code, the venue, the day and the payload's refund with the code-gated link; a suppressed
 * address is skipped with the publication complete. Bookings are SQL-seeded on 2029-08-xx, a month no
 * other mail IT claims (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class DayRefundMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	EmailSuppressions suppressions;

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

	private String venueNameOf(long venueId) {
		return jdbc.sql("SELECT name FROM venue WHERE id = :id").param("id", venueId).query(String.class).single();
	}

	private long countTo(String email) {
		return mailer.sent().stream().filter(sent -> sent.toEmail().equals(email)).count();
	}

	@Test
	void mailsTheDayAndTheRefundUnderTheBookingsCodeWithTheLink() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate day = LocalDate.of(2029, 8, 8);
		String guest = "washed-out-day@example.com";
		long bookingId = fixtures.seedBooking(set, "DAYWX0001", day.minusDays(2), guest, 42000L, "CONFIRMED");

		fixtures.publishInTransaction(new BookingDayRefunded(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), day, 3000L, "EUR", null, RefundReason.WEATHER, false));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);
		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.DAY_REFUND);
		DayRefundMail mail = sent.dayRefund();
		assertThat(mail).isEqualTo(new DayRefundMail("DAYWX0001", venueNameOf(set.venueId()), day, 3000L, "EUR",
				RefundReason.WEATHER, false, mail.bookingLink()));
		assertThat(mail.bookingLink().getPath()).endsWith("/booking/DAYWX0001");
		assertThat(fixtures.outstandingPublicationsMatching(BookingMailFixtures.DAY_REFUND_LISTENER_ID, "3000"))
				.as("the publication completes once the mail left").isZero();
	}

	@Test
	void aSuppressedAddressGetsNoMailAndThePublicationCompletes() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate day = LocalDate.of(2029, 8, 18);
		String guest = "suppressed-day@example.com";
		suppressions.suppress(guest, SuppressionReason.HARD_BOUNCE, java.time.Instant.now());
		long bookingId = fixtures.seedBooking(set, "DAYWX0002", day.minusDays(1), guest, 9000L, "CONFIRMED");

		fixtures.publishInTransaction(new BookingDayRefunded(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), day, 3001L, "EUR", null, RefundReason.WEATHER, false));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.DAY_REFUND_LISTENER_ID, "3001") == 0L);
		assertThat(countTo(guest)).isZero();
	}
}
