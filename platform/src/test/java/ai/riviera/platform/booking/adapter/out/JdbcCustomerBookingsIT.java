package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.CustomerBookings;
import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.vocabulary.CustomerId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code booking.api.CustomerBookings} read port (#380): which bookings belong to one guest
 * contact, for the admin mail-delivery view. Split from {@code BookingNotificationFacts} by consumer
 * role (the #94 rule) — that port answers "tell the guest about <em>this</em> booking", this one
 * answers "which bookings does this person have".
 *
 * <p>It lives in {@code booking} because {@code booking} owns the table; {@code customer}'s Not-My-Job
 * list says so explicitly ("Bookings → {@code booking}"). Testcontainers; skipped without Docker.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcCustomerBookingsIT {

	@Autowired
	CustomerBookings customerBookings;

	@Autowired
	JdbcClient jdbc;

	@Test
	void listsOneGuestsBookingsNewestFirst() {
		CustomerId guest = insertCustomer("has-bookings@example.com");
		insertConfirmedBooking("CUSTB001", guest, LocalDate.of(2028, 7, 1));
		insertConfirmedBooking("CUSTB002", guest, LocalDate.of(2028, 7, 9));

		List<CustomerBookingSummary> found = customerBookings.forCustomer(guest);

		assertEquals(List.of(LocalDate.of(2028, 7, 9), LocalDate.of(2028, 7, 1)),
				found.stream().map(CustomerBookingSummary::bookingDate).toList(),
				"newest first — the booking a support call is about is almost always the latest");
	}

	@Test
	void carriesTheVenueAndWhetherAConfirmationWasEverDue() {
		CustomerId guest = insertCustomer("mixed-bookings@example.com");
		long confirmed = insertConfirmedBooking("CUSTB003", guest, LocalDate.of(2028, 8, 2));
		insertBooking("CUSTB004", guest, LocalDate.of(2028, 8, 3), "AWAITING_PAYMENT");

		List<CustomerBookingSummary> found = customerBookings.forCustomer(guest);

		CustomerBookingSummary awaiting = found.getFirst();
		CustomerBookingSummary wasConfirmed = found.getLast();
		assertFalse(awaiting.everConfirmed(), "never confirmed — no confirmation mail was ever due");
		assertTrue(wasConfirmed.everConfirmed());
		assertEquals(confirmed, wasConfirmed.bookingId().value());
		assertEquals(venueOfOnlineSet(), wasConfirmed.venueId().value(),
				"the venue id the view resolves a name from through venue::api");
	}

	@Test
	void seesOnlyTheRequestedGuestsBookings() {
		CustomerId mine = insertCustomer("mine@example.com");
		CustomerId theirs = insertCustomer("theirs@example.com");
		insertConfirmedBooking("CUSTB005", mine, LocalDate.of(2028, 9, 4));
		insertConfirmedBooking("CUSTB006", theirs, LocalDate.of(2028, 9, 5));

		assertEquals(1, customerBookings.forCustomer(mine).size());
	}

	@Test
	void answersAnEmptyListForAGuestWithNoBookings() {
		CustomerId guest = insertCustomer("no-bookings@example.com");

		assertTrue(customerBookings.forCustomer(guest).isEmpty(),
				"empty, never null — an address with no bookings is an ordinary answer");
	}

	/**
	 * The cap exists so one pathological guest cannot turn a support lookup into an unbounded read.
	 * Newest-first ordering is what makes the cap safe: the rows dropped are the oldest.
	 */
	@Test
	void capsTheListAtTwentyKeepingTheNewest() {
		CustomerId guest = insertCustomer("many-bookings@example.com");
		for (int i = 0; i < 22; i++) {
			insertConfirmedBooking("CAP%03d".formatted(i), guest, LocalDate.of(2029, 1, 1).plusDays(i));
		}

		List<CustomerBookingSummary> found = customerBookings.forCustomer(guest);

		assertEquals(20, found.size());
		assertEquals(LocalDate.of(2029, 1, 22), found.getFirst().bookingDate(),
				"the newest is kept; the two oldest are the ones dropped");
	}

	private CustomerId insertCustomer(String email) {
		return new CustomerId(jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", email).query(Long.class).single());
	}

	private long venueOfOnlineSet() {
		return jdbc.sql("SELECT venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private long insertBooking(String code, CustomerId customerId, LocalDate date, String status) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				SELECT :code, sp.venue_id, sp.id, :cust, :date, 2500, 'EUR', :status
				FROM set_position sp WHERE sp.pool = 'ONLINE' ORDER BY sp.id LIMIT 1
				RETURNING id
				""")
				.param("code", code).param("cust", customerId.value())
				.param("date", date).param("status", status)
				.query(Long.class).single();
	}

	private long insertConfirmedBooking(String code, CustomerId customerId, LocalDate date) {
		long bookingId = insertBooking(code, customerId, date, "CONFIRMED");
		jdbc.sql("UPDATE booking SET confirmed_at = NOW() WHERE id = :id").param("id", bookingId).update();
		return bookingId;
	}
}
