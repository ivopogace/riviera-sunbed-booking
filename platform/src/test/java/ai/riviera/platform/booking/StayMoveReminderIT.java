package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.MovableClock;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.SeededStay;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.checkin.RemindStayMoves;
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The move-reminder sweep under a fixed clock (design D13, story 22): the evening before a stitched
 * stay's move it publishes one {@code StayMoveDue} naming the arriving stretch and stamps it, so a second
 * run publishes nothing; before the send hour, on other evenings, for a cancelled stay, an ended arriving
 * stretch or two stretches on one set, nothing. Dates are 2030-06-xx, this class's own (invariant #2).
 * Real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, StayMoveReminderIT.ClockOverride.class})
@SpringBootTest(properties = {"booking.no-show.enabled=false", "booking.move-reminder.enabled=false"})
@RecordApplicationEvents
class StayMoveReminderIT {

	private static final LocalTime SEND_FROM = LocalTime.of(18, 0);
	private static final LocalDate FIRST = LocalDate.of(2030, 6, 10);
	/** The stay's move: three days on the first set, then the second from the 13th. */
	private static final LocalDate MOVE_DAY = FIRST.plusDays(3);
	/** 18:30 in Tirane (CEST) on the 12th — the evening before the move. */
	private static final Instant EVENING_BEFORE = Instant.parse("2030-06-12T16:30:00Z");
	/** 17:30 in Tirane on the 12th — before the send hour. */
	private static final Instant AFTERNOON_BEFORE = Instant.parse("2030-06-12T15:30:00Z");

	@TestConfiguration(proxyBeanMethods = false)
	static class ClockOverride {
		@Bean
		@Primary
		MovableClock movableClock() {
			return new MovableClock(EVENING_BEFORE);
		}
	}

	@Autowired
	RemindStayMoves remindStayMoves;

	@Autowired
	MovableClock clock;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	private static String code(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private Instant reminderStamp(long bookingId) {
		return jdbc.sql("SELECT move_reminder_at FROM booking WHERE id = :id").param("id", bookingId)
				.query((rs, rowNum) -> java.util.Optional.ofNullable(rs.getTimestamp("move_reminder_at"))
						.map(java.sql.Timestamp::toInstant)).single().orElse(null);
	}

	@Test
	void theEveningBeforeAMoveAnnouncesItOnce() {
		Venue venue = venue();
		SeededStay stay = StayFixtures.insertStay(jdbc, venue, code("RMND"), FIRST, venue.online().get(0), 3,
				"CONFIRMED", venue.online().get(1), 3, "CONFIRMED");
		clock.set(EVENING_BEFORE);

		assertEquals(1, remindStayMoves.sweep(SEND_FROM));

		long arriving = stay.stretches().get(1);
		List<StayMoveDue> published = events.stream(StayMoveDue.class)
				.filter(e -> e.stayId().equals(new StayId(stay.id()))).toList();
		assertEquals(List.of(new StayMoveDue(new StayId(stay.id()), new BookingId(arriving), MOVE_DAY)), published);
		assertEquals(EVENING_BEFORE, reminderStamp(arriving), "the arriving stretch carries the stamp");
		assertNull(reminderStamp(stay.stretches().get(0)), "the stretch the guest leaves is not stamped");

		assertEquals(0, remindStayMoves.sweep(SEND_FROM), "a second run finds the move reminded");
		assertEquals(1, events.stream(StayMoveDue.class)
				.filter(e -> e.stayId().equals(new StayId(stay.id()))).count());
	}

	@Test
	void nothingIsDueOutsideTheEveningBefore() {
		Venue venue = venue();
		SeededStay stay = StayFixtures.insertStay(jdbc, venue, code("RMNO"), FIRST, venue.online().get(0), 3,
				"CONFIRMED", venue.online().get(1), 3, "CONFIRMED");

		clock.set(AFTERNOON_BEFORE);
		assertEquals(0, remindStayMoves.sweep(SEND_FROM), "before the send hour");
		clock.set(EVENING_BEFORE.minusSeconds(86_400));
		assertEquals(0, remindStayMoves.sweep(SEND_FROM), "two evenings before the move: the guest stays put tomorrow");
		clock.set(EVENING_BEFORE.plusSeconds(86_400));
		assertEquals(0, remindStayMoves.sweep(SEND_FROM), "the evening of the move day: nothing moves tomorrow");
		assertNull(reminderStamp(stay.stretches().get(1)));
		assertEquals(0, events.stream(StayMoveDue.class).filter(e -> e.stayId().equals(new StayId(stay.id()))).count());

		clock.set(EVENING_BEFORE);
		assertEquals(1, remindStayMoves.sweep(SEND_FROM), "the same stay is due once the evening before arrives");
	}

	@Test
	void aCancelledStayAnEndedStretchAndASameSetStayGetNoReminderWhileACheckedInOneDoes() {
		Venue venue = venue();
		SeededStay cancelled = StayFixtures.insertStay(jdbc, venue, code("RMCA"), FIRST, venue.online().get(0), 3,
				"CANCELLED", venue.online().get(1), 3, "CANCELLED");
		SeededStay ended = StayFixtures.insertStay(jdbc, venue, code("RMEN"), FIRST, venue.online().get(0), 3,
				"CONFIRMED", venue.online().get(1), 3, "CANCELLED");
		SeededStay sameSet = StayFixtures.insertStay(jdbc, venue, code("RMSS"), FIRST, venue.online().get(2), 3,
				"CONFIRMED", venue.online().get(2), 3, "CONFIRMED");
		SeededStay checkedIn = StayFixtures.insertStay(jdbc, venue, code("RMCI"), FIRST, venue.online().get(0), 3,
				"COMPLETED", venue.online().get(1), 3, "CONFIRMED");
		clock.set(EVENING_BEFORE);

		assertEquals(1, remindStayMoves.sweep(SEND_FROM));

		for (SeededStay silent : List.of(cancelled, ended, sameSet)) {
			assertNull(reminderStamp(silent.stretches().get(1)), silent.code() + " is not reminded");
		}
		assertNotNull(reminderStamp(checkedIn.stretches().get(1)),
				"a stretch resolved COMPLETED by today's last-day check-in still has a guest to remind");
		assertEquals(List.of(new StayId(checkedIn.id())),
				events.stream(StayMoveDue.class).map(StayMoveDue::stayId).filter(id -> List.of(cancelled.id(),
						ended.id(), sameSet.id(), checkedIn.id()).contains(id.value())).toList());
	}
}
