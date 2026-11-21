package ai.riviera.platform.booking;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * AC-1 (issue #9): confirming a booking publishes exactly one {@link BookingConfirmed} carrying
 * technical ids + immutable value only — no aggregates, no mutable fields (invariant #11). Drives
 * the real Instant-Book stub path (which confirms in-transaction) and records the events published
 * during the call. The async {@code payout} delivery is covered separately (Phase 4); here we pin
 * the <em>publication and payload</em> at the inner hexagon, independent of any listener.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class BookingEventIT {

	private static final GuestContact GUEST = new GuestContact("event@example.com", "Eve Ent", "+355612");

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	@Autowired
	Clock clock;

	/** This test's own venue, so no other class holds the {@code (set, date)} it confirms on (#2). */
	private StayFixtures.Venue venue;

	@BeforeEach
	void seedVenue() {
		venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
	}

	@AfterEach
	void removeVenue() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	@Test
	void publishesBookingConfirmedOnConfirm() {
		SetId set = venue.online().getFirst();
		LocalDate date = TiraneDaytimeClock.today(clock).plusDays(30);

		BookingOutcome outcome =
				createBooking.create(new CreateBookingCommand(set, date, GUEST));
		assertInstanceOf(BookingOutcome.Confirmed.class, outcome);

		List<BookingConfirmed> published = events.stream(BookingConfirmed.class).toList();
		assertEquals(1, published.size(), "exactly one BookingConfirmed is published on confirm");

		BookingConfirmed event = published.getFirst();
		assertEquals(set, event.setId(), "carries the set id");
		assertEquals(venue.id(), event.venueId().value(), "carries the owning venue id");
		assertEquals(date, event.bookingDate(), "carries the booking date");
		assertEquals(StayFixtures.PRICE, event.amountMinor(), "gross amount = set price, minor units (#5)");
		assertEquals("EUR", event.currency(), "carries the ISO currency");

		long persistedId = jdbc.sql("SELECT id FROM booking WHERE set_id = :s AND booking_date = :d")
				.param("s", set.value()).param("d", date).query(Long.class).single();
		assertEquals(persistedId, event.bookingId().value(), "carries the booking's technical id");
	}
}
