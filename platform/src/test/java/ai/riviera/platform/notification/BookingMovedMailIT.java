package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import jakarta.servlet.http.Cookie;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code BookingMoved} → one "your spot changed" mail through the registry vehicle: the code, the
 * venue, both spots as the receipt snapshotted them, the distance, the free-exit deadline and the
 * code-gated link; a suppressed address is skipped with the publication complete; and the mock
 * outbox read answers the mail for a real-backend run without a code or a link. Dates are 2029-08-xx,
 * this class's own, so no other IT's claim collides (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class BookingMovedMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	RemodelReceipts receipts;

	@Autowired
	BookingCutoff cutoff;

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

	@Test
	void mailsTheGuestTheNewSpotTheDistanceAndTheDeadlineAndTheMockOutboxReadsItBack() throws Exception {
		BookingMailFixtures.SetRef from = fixtures.onlineSet();
		long to = insertSet(from.venueId(), 87);
		LocalDate date = LocalDate.of(2029, 8, 10);
		String guest = "moved-guest-" + System.nanoTime() + "@example.com";
		long booking = fixtures.seedBooking(new BookingMailFixtures.SetRef(to, from.venueId()), "MOVED001", date,
				guest, 4500L, "CONFIRMED");
		Instant movedAt = Instant.parse("2029-08-01T13:00:00Z");
		jdbc.sql("UPDATE booking SET moved_at = :at WHERE id = :id").param("at", java.sql.Timestamp.from(movedAt))
				.param("id", booking).update();
		receipts.record(new VenueId(from.venueId()), operatorId(), movedAt, List.of(new ReceiptMove(
				new BookingId(booking), date, new SpotRef(new SetId(from.setId()), "A", 3),
				new SpotRef(new SetId(to), "Z", 87), 0, 84)));
		String venueName = jdbc.sql("SELECT name FROM venue WHERE id = :v").param("v", from.venueId())
				.query(String.class).single();

		fixtures.publishInTransaction(fixtures.movedOf(from, to, booking, date));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);
		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.BOOKING_MOVED);
		Instant deadline = cutoff.freeExitEndsAt(date, movedAt);
		assertThat(sent.moved()).isEqualTo(new BookingMovedMail("MOVED001", venueName, date, "A", 3, "Z", 87, 0, 84,
				deadline, URI.create(sent.moved().bookingLink().toString())));
		assertThat(sent.moved().bookingLink().getPath()).endsWith("/booking/MOVED001");
		assertThat(fixtures.outstandingPublicationsMatching(BookingMailFixtures.BOOKING_MOVED_LISTENER_ID,
				String.valueOf(booking))).isZero();

		Cookie operator = SessionLoginSupport.operatorSession(mvc, "operator", "test-operator-pw");
		mvc.perform(get("/api/mock-mail/booking-mails").param("to", guest).cookie(operator))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].kind").value("BOOKING_MOVED"))
				.andExpect(jsonPath("$[0].from").value("A3"))
				.andExpect(jsonPath("$[0].to").value("Z87"))
				.andExpect(jsonPath("$[0].positionsAway").value(84))
				.andExpect(jsonPath("$[0].freeExitUntil").value(deadline.toString()))
				.andExpect(jsonPath("$[0].venueName").value(venueName))
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
						.string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("MOVED001"))));
		mvc.perform(get("/api/mock-mail/booking-mails").param("to", guest))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aSuppressedAddressIsSkippedAndThePublicationCompletes() {
		BookingMailFixtures.SetRef from = fixtures.onlineSet();
		long to = insertSet(from.venueId(), 88);
		LocalDate date = LocalDate.of(2029, 8, 11);
		String suppressed = "suppressed-move-" + System.nanoTime() + "@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());
		long booking = fixtures.seedBooking(new BookingMailFixtures.SetRef(to, from.venueId()), "MOVED002", date,
				suppressed, 4500L, "CONFIRMED");
		Instant movedAt = Instant.parse("2029-08-01T13:00:00Z");
		jdbc.sql("UPDATE booking SET moved_at = :at WHERE id = :id").param("at", java.sql.Timestamp.from(movedAt))
				.param("id", booking).update();
		receipts.record(new VenueId(from.venueId()), operatorId(), movedAt, List.of(new ReceiptMove(
				new BookingId(booking), date, new SpotRef(new SetId(from.setId()), "A", 3),
				new SpotRef(new SetId(to), "Z", 88), 0, 85)));

		fixtures.publishInTransaction(fixtures.movedOf(from, to, booking, date));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.BOOKING_MOVED_LISTENER_ID, String.valueOf(booking)) == 0L);
		assertThat(countTo(suppressed)).isZero();
	}

	private long insertSet(long venueId, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'Z', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 26) RETURNING id
				""").param("v", venueId).param("pos", position).query(Long.class).single();
	}

	private OperatorId operatorId() {
		return new OperatorId(jdbc.sql("SELECT id FROM operator ORDER BY id LIMIT 1").query(Long.class).single());
	}

	private long countTo(String email) {
		return mailer.sent().stream().filter(sent -> sent.toEmail().equals(email)).count();
	}
}
