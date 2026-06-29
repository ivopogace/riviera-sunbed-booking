package ai.riviera.platform.booking;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;
import ai.riviera.platform.booking.application.in.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.api.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Full-wiring integration test of the Instant-Book use case (issue #6, AC-1/8) against real
 * Postgres + the real claim, stub payment, and JDBC persistence. Proves the happy path
 * confirms the booking and persists the expected row state; a second attempt on the same
 * (set, date) is rejected (AC-2) and writes no second booking.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BookingServiceIT {

	private static final GuestContact GUEST = new GuestContact("guest@example.com", "Guest One", "+355611");

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	private SetId freeOnlineSet() {
		// An online set with no availability row yet for the test date.
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id DESC LIMIT 1")
				.query(Long.class).single());
	}

	private LocalDate farFutureDate() {
		return LocalDate.now().plusYears(1); // comfortably past any evening-before cutoff
	}

	@Test
	void createsConfirmedBookingAndPersistsState() {
		SetId set = freeOnlineSet();
		LocalDate date = farFutureDate();

		BookingOutcome outcome = createBooking.create(new CreateBookingCommand(set, date, GUEST));

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		String code = confirmed.confirmation().code();

		String status = jdbc.sql("SELECT status FROM booking WHERE code = :code")
				.param("code", code).query(String.class).single();
		long amount = jdbc.sql("SELECT amount_minor FROM booking WHERE code = :code")
				.param("code", code).query(Long.class).single();
		long availRows = jdbc.sql(
				"SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(Long.class).single();

		assertEquals("CONFIRMED", status);
		assertEquals(confirmed.confirmation().set().price().minorUnits(), amount,
				"booking amount is the set price in minor units (invariant #5)");
		assertEquals(1L, availRows, "the (set, date) is claimed exactly once");
	}

	@Test
	void secondBookingOnSameSetDateIsRejected() {
		SetId set = freeOnlineSet();
		LocalDate date = farFutureDate().plusDays(1);

		assertInstanceOf(BookingOutcome.Confirmed.class,
				createBooking.create(new CreateBookingCommand(set, date, GUEST)));

		BookingOutcome second = createBooking.create(new CreateBookingCommand(set, date, GUEST));
		assertEquals(BookingOutcome.Rejected.SET_TAKEN, second);

		long bookingRows = jdbc.sql(
				"SELECT count(*) FROM booking WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(Long.class).single();
		assertEquals(1L, bookingRows, "the rejected second attempt must not create a booking row");
	}
}
