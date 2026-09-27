package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
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
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code StayMoveDue} → one move reminder through the registry vehicle: the stay's code, the venue,
 * tomorrow's date and the stay's last day, today's and tomorrow's spots as the live map labels them, the
 * distance and the code-gated link; a suppressed address is skipped with the publication complete; and
 * the mock outbox read answers the mail for a real-backend run without a code or a link. Stays are
 * SQL-seeded on the first seeded venue's online sets on 2033-07-xx, this class's own dates (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"riviera.operator.password=test-operator-pw", "booking.move-reminder.enabled=false"})
@AutoConfigureMockMvc
class MoveReminderMailIT {

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
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private BookingMailFixtures fixtures;

	private record Spot(long setId, long venueId, String venueName, String rowLabel, int positionNo, int gridY) {
	}

	private record SeededStay(long id, String code, long arriving, LocalDate moveDay, LocalDate last) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	@Test
	void mailsTomorrowsSpotTheDistanceAndTheLinkAndTheMockOutboxReadsItBack() throws Exception {
		List<Spot> spots = twoSpotsOfOneVenue();
		String guest = "move-reminder-" + System.nanoTime() + "@example.com";
		SeededStay stay = seedStay(spots, LocalDate.of(2033, 7, 10), guest);

		fixtures.publishInTransaction(new StayMoveDue(new StayId(stay.id()), new BookingId(stay.arriving()), stay.moveDay()));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);
		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.MOVE_REMINDER);
		Spot from = spots.get(0);
		Spot to = spots.get(1);
		assertThat(sent.moveReminder()).isEqualTo(new MoveReminderMail(stay.code(), from.venueName(), stay.moveDay(),
				stay.last(), from.rowLabel(), from.positionNo(), to.rowLabel(), to.positionNo(),
				Math.abs(to.gridY() - from.gridY()), Math.abs(to.positionNo() - from.positionNo()),
				URI.create(sent.moveReminder().bookingLink().toString())));
		assertThat(sent.moveReminder().bookingLink().getPath()).endsWith("/booking/" + stay.code());
		assertThat(fixtures.outstandingPublicationsMatching(BookingMailFixtures.MOVE_REMINDER_LISTENER_ID,
				String.valueOf(stay.arriving()))).isZero();

		Cookie operator = SessionLoginSupport.operatorSession(mvc, "operator", "test-operator-pw");
		mvc.perform(get("/api/mock-mail/booking-mails").param("to", guest).cookie(operator))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].kind").value("MOVE_REMINDER"))
				.andExpect(jsonPath("$[0].bookingDate").value(stay.moveDay().toString()))
				.andExpect(jsonPath("$[0].from").value(from.rowLabel() + from.positionNo()))
				.andExpect(jsonPath("$[0].to").value(to.rowLabel() + to.positionNo()))
				.andExpect(jsonPath("$[0].venueName").value(from.venueName()))
				.andExpect(content().string(not(containsString(stay.code()))));
	}

	@Test
	void aSuppressedAddressGetsNoReminderAndThePublicationCompletes() {
		List<Spot> spots = twoSpotsOfOneVenue();
		String guest = "move-reminder-suppressed-" + System.nanoTime() + "@example.com";
		suppressions.suppress(guest, SuppressionReason.HARD_BOUNCE, java.time.Instant.now());
		SeededStay stay = seedStay(spots, LocalDate.of(2033, 7, 20), guest);

		fixtures.publishInTransaction(new StayMoveDue(new StayId(stay.id()), new BookingId(stay.arriving()), stay.moveDay()));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsMatching(
				BookingMailFixtures.MOVE_REMINDER_LISTENER_ID, String.valueOf(stay.arriving())) == 0L);
		assertThat(countTo(guest)).isZero();
	}

	private long countTo(String guest) {
		return mailer.sent().stream().filter(sent -> sent.toEmail().equals(guest)).count();
	}

	private List<Spot> twoSpotsOfOneVenue() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name, sp.row_label, sp.position_no, sp.grid_y
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' AND sp.retired_at IS NULL
				  AND sp.venue_id = (SELECT venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1)
				ORDER BY sp.id LIMIT 2
				""")
				.query((rs, n) -> new Spot(rs.getLong("id"), rs.getLong("venue_id"), rs.getString("name"),
						rs.getString("row_label"), rs.getInt("position_no"), rs.getInt("grid_y")))
				.list();
	}

	/** Three days on the first spot, then two on the second, both stretches confirmed; nothing is claimed. */
	private SeededStay seedStay(List<Spot> spots, LocalDate first, String email) {
		String code = "MVRM" + System.nanoTime() % 1_000_000;
		LocalDate moveDay = first.plusDays(3);
		LocalDate last = moveDay.plusDays(1);
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Stay Guest', '+355699') "
				+ "RETURNING id").param("e", email).query(Long.class).single();
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id
				""").param("code", code).param("v", spots.get(0).venueId()).param("first", first).param("last", last)
				.query(Long.class).single();
		seedStretch(spots.get(0), code + "-1", customer, stay, first, moveDay.minusDays(1));
		long arriving = seedStretch(spots.get(1), code + "-2", customer, stay, moveDay, last);
		return new SeededStay(stay, code, arriving, moveDay, last);
	}

	private long seedStretch(Spot spot, String rowCode, long customer, long stay, LocalDate first, LocalDate last) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, confirmed_at, stay_id)
				VALUES (:code, :v, :set, :c, :first, :last, 4500, 'EUR', 'CONFIRMED', now(), :stay)
				RETURNING id
				""").param("code", rowCode).param("v", spot.venueId()).param("set", spot.setId()).param("c", customer)
				.param("first", first).param("last", last).param("stay", stay).query(Long.class).single();
	}
}
