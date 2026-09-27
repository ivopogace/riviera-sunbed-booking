package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.SeededStay;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;
import ai.riviera.platform.customer.vocabulary.CustomerId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * {@link BookingNotificationFacts#moveReminderFacts}: the stay's code (never a row code, invariant #7),
 * the guest, the move day, the stay's last day, both sets and the live-map distance for a move whose two
 * stretches stand; nothing for the first stretch, an ended stretch or a set off the active map. Dates are
 * 2031-06-xx, this class's own (invariant #2). Real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"booking.no-show.enabled=false", "booking.move-reminder.enabled=false"})
class StayMoveFactsIT {

	private static final LocalDate FIRST = LocalDate.of(2031, 6, 10);

	@Autowired
	BookingNotificationFacts facts;

	@Autowired
	JdbcClient jdbc;

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

	private long customerOf(long bookingId) {
		return jdbc.sql("SELECT customer_id FROM booking WHERE id = :b").param("b", bookingId).query(Long.class).single();
	}

	@Test
	void aStandingMoveResolvesTheStaysCodeBothSetsAndTheLiveDistance() {
		Venue venue = venue();
		SeededStay stay = StayFixtures.insertStay(jdbc, venue, "MVF" + System.nanoTime() % 1_000_000, FIRST,
				venue.online().get(0), 2, "COMPLETED", venue.online().get(2), 3, "CONFIRMED");
		long arriving = stay.stretches().get(1);

		Optional<StayMoveFacts> move = facts.moveReminderFacts(new BookingId(arriving));

		assertEquals(Optional.of(new StayMoveFacts(new StayId(stay.id()), stay.code(), new CustomerId(customerOf(arriving)),
				FIRST.plusDays(2), FIRST.plusDays(4), venue.online().get(0), venue.online().get(2), 0, 2)), move,
				"positions 1 → 3 in row A: two positions along the row");
	}

	@Test
	void theFirstStretchAnEndedMoveAndARetiredSetResolveNothing() {
		Venue venue = venue();
		SeededStay stay = StayFixtures.insertStay(jdbc, venue, "MVN" + System.nanoTime() % 1_000_000, FIRST,
				venue.online().get(0), 2, "CONFIRMED", venue.online().get(1), 3, "CONFIRMED");
		SeededStay ended = StayFixtures.insertStay(jdbc, venue, "MVE" + System.nanoTime() % 1_000_000, FIRST,
				venue.online().get(0), 2, "CANCELLED", venue.online().get(1), 3, "CONFIRMED");

		assertEquals(Optional.empty(), facts.moveReminderFacts(new BookingId(stay.stretches().get(0))),
				"the first stretch follows nothing");
		assertEquals(Optional.empty(), facts.moveReminderFacts(new BookingId(ended.stretches().get(1))),
				"the stretch the guest would leave was ended by a remodel");

		jdbc.sql("UPDATE set_position SET retired_at = now() WHERE id = :s").param("s", venue.online().get(0).value())
				.update();
		assertEquals(Optional.empty(), facts.moveReminderFacts(new BookingId(stay.stretches().get(1))),
				"a set off the active map has no placement to measure from");
	}
}
