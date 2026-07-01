package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.BookingConfirmed;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.api.SetId;

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

	private record SetRef(long setId, long venueId, long priceMinor, String currency) {
	}

	private SetRef freeOnlineSet() {
		return jdbc.sql("""
				SELECT id, venue_id, price_minor, price_currency
				FROM set_position WHERE pool = 'ONLINE' ORDER BY id DESC LIMIT 1
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"),
						rs.getLong("price_minor"), rs.getString("price_currency")))
				.single();
	}

	@Test
	void publishesBookingConfirmedOnConfirm() {
		SetRef set = freeOnlineSet();
		// A distinctive far-future date so this (set, date) cannot collide with other create-flow
		// ITs sharing the Testcontainers context (e.g. BookingServiceIT uses now()+1y).
		LocalDate date = LocalDate.of(2035, 1, 15);

		BookingOutcome outcome =
				createBooking.create(new CreateBookingCommand(new SetId(set.setId()), date, GUEST));
		assertInstanceOf(BookingOutcome.Confirmed.class, outcome);

		List<BookingConfirmed> published = events.stream(BookingConfirmed.class).toList();
		assertEquals(1, published.size(), "exactly one BookingConfirmed is published on confirm");

		BookingConfirmed event = published.getFirst();
		assertEquals(set.setId(), event.setId().value(), "carries the set id");
		assertEquals(set.venueId(), event.venueId().value(), "carries the owning venue id");
		assertEquals(date, event.bookingDate(), "carries the booking date");
		assertEquals(set.priceMinor(), event.amountMinor(), "gross amount = set price, minor units (#5)");
		assertEquals(set.currency(), event.currency(), "carries the ISO currency");

		long persistedId = jdbc.sql("SELECT id FROM booking WHERE set_id = :s AND booking_date = :d")
				.param("s", set.setId()).param("d", date).query(Long.class).single();
		assertEquals(persistedId, event.bookingId().value(), "carries the booking's technical id");
	}
}
