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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
		attendedDaysOf(stay.stretches().get(0));
		long arriving = stay.stretches().get(1);

		Optional<StayMoveFacts> move = facts.moveReminderFacts(new BookingId(arriving));

		assertEquals(Optional.of(new StayMoveFacts(new StayId(stay.id()), stay.code(), new CustomerId(customerOf(arriving)),
				FIRST.plusDays(2), FIRST.plusDays(4), venue.online().get(0), venue.online().get(2), 0, 2, true)), move,
				"positions 1 → 3 in row A: two positions along the row");
	}

	/** #1381: a refunded departure day drops "today's spot"; a refunded move day is no move to remind the guest of. */
	@Test
	void aRefundedDepartureDayDropsTodaysSpotAndARefundedMoveDayResolvesNothing() {
		Venue venue = venue();
		SeededStay departureRefunded = StayFixtures.insertStay(jdbc, venue, "MVD" + System.nanoTime() % 1_000_000, FIRST,
				venue.online().get(0), 2, "CONFIRMED", venue.online().get(1), 3, "CONFIRMED");
		SeededStay moveDayRefunded = StayFixtures.insertStay(jdbc, venue, "MVR" + System.nanoTime() % 1_000_000,
				FIRST.plusDays(10), venue.online().get(0), 2, "CONFIRMED", venue.online().get(1), 3, "CONFIRMED");
		refundDay(departureRefunded.stretches().get(0), FIRST.plusDays(1));
		refundDay(moveDayRefunded.stretches().get(1), FIRST.plusDays(12));

		Optional<StayMoveFacts> move = facts.moveReminderFacts(new BookingId(departureRefunded.stretches().get(1)));

		assertTrue(move.isPresent(), "the move still stands: tomorrow is the guest's");
		assertFalse(move.get().fromDayHeld(), "but the day before was refunded, so there is no today's spot to name");
		assertEquals(Optional.empty(), facts.moveReminderFacts(new BookingId(moveDayRefunded.stretches().get(1))),
				"a move onto a day the guest no longer holds resolves nothing, so a stamped race is abandoned");
	}

	/** The service-day rows a stretch seeded straight into {@code COMPLETED} skipped (the trigger writes them on confirm), attended. */
	private void attendedDaysOf(long bookingId) {
		jdbc.sql("""
				INSERT INTO booking_day (booking_id, service_date, attended_at)
				SELECT b.id, d::date, now() FROM booking b, generate_series(b.booking_date, b.last_date, interval '1 day') d
				WHERE b.id = :b
				""").param("b", bookingId).update();
	}

	private void refundDay(long bookingId, java.time.LocalDate day) {
		jdbc.sql("UPDATE booking_day SET refunded_at = now(), refund_minor = 0, refund_reason = 'WEATHER' "
				+ "WHERE booking_id = :b AND service_date = :d").param("b", bookingId).param("d", day).update();
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

		assertTrue(facts.moveReminderFacts(new BookingId(stay.stretches().get(1))).isPresent(),
				"the standing move resolves before its set retires");
		jdbc.sql("UPDATE set_position SET retired_at = now() WHERE id = :s").param("s", venue.online().get(0).value())
				.update();
		assertEquals(Optional.empty(), facts.moveReminderFacts(new BookingId(stay.stretches().get(1))),
				"a set off the active map has no placement to measure from");
	}
}
