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
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CancelBooking;
import ai.riviera.platform.booking.application.in.CancelOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;
import ai.riviera.platform.booking.application.in.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.api.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * AC-4/AC-5/AC-7 (issue #11): cancelling a CONFIRMED booking frees the {@code (set, date)}
 * (invariant #2), stamps the server-computed refund, and publishes exactly one
 * {@link BookingCancelled}; a non-CONFIRMED booking is rejected. Drives the real stub path through
 * the {@link CancelBooking} port against Testcontainers Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class CancelBookingIT {

	private static final GuestContact GUEST = new GuestContact("cancel@example.com", "Cara Ncel", "+355613");

	@Autowired
	CreateBooking createBooking;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private record Created(String code, long id, long setId, long amountMinor) {
	}

	private Created confirmBookingOn(LocalDate date) {
		long setId = jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id DESC LIMIT 1")
				.query(Long.class).single();
		BookingOutcome outcome =
				createBooking.create(new CreateBookingCommand(new SetId(setId), date, GUEST));
		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		String code = confirmed.confirmation().code();
		long id = jdbc.sql("SELECT id FROM booking WHERE code = :c").param("c", code)
				.query(Long.class).single();
		long amount = jdbc.sql("SELECT amount_minor FROM booking WHERE id = :id").param("id", id)
				.query(Long.class).single();
		return new Created(code, id, setId, amount);
	}

	private long availabilityRows(long setId, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Long.class).single();
	}

	@Test
	void cancelBeforeCutoffFullyRefundsReleasesAndPublishes() {
		LocalDate date = LocalDate.of(2035, 3, 20); // far future → before cutoff → full refund
		Created booking = confirmBookingOn(date);
		assertEquals(1, availabilityRows(booking.setId(), date), "the set is held before cancel");

		CancelOutcome outcome = cancelBooking.cancel(booking.code());

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier(), "before the cutoff is a full refund");
		assertEquals(booking.amountMinor(), cancelled.refundMinor(), "full refund = the amount paid");

		assertEquals("CANCELLED", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single());
		assertEquals(booking.amountMinor(), jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
				.param("id", booking.id()).query(Long.class).single(), "refund is stamped on the booking");
		assertEquals(0, availabilityRows(booking.setId(), date), "cancel releases the (set, date)");

		List<BookingCancelled> published = events.stream(BookingCancelled.class).toList();
		assertEquals(1, published.size(), "exactly one BookingCancelled is published");
		assertEquals(booking.id(), published.getFirst().bookingId().value());
		assertEquals(booking.amountMinor(), published.getFirst().refundMinor(), "event carries the refund");
	}

	@Test
	void cancellingTwiceIsNotCancellableTheSecondTime() {
		Created booking = confirmBookingOn(LocalDate.of(2035, 4, 10));

		assertInstanceOf(CancelOutcome.Cancelled.class, cancelBooking.cancel(booking.code()));
		CancelOutcome second = cancelBooking.cancel(booking.code());

		assertInstanceOf(CancelOutcome.NotCancellable.class, second,
				"a re-cancel is a no-op guarded by the CONFIRMED transition");
		List<BookingCancelled> published = events.stream(BookingCancelled.class).toList();
		assertEquals(1, published.size(), "the second cancel publishes nothing (exactly-once)");
	}

	@Test
	void unknownCodeIsNotFound() {
		assertInstanceOf(CancelOutcome.NotFound.class, cancelBooking.cancel("NOSUCHCODE"));
	}
}
