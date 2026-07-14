package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.OptionalLong;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.NewBooking;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S3 (#114): a booking created while signed in carries the customer's {@link CustomerAccountId} in
 * {@code booking.account_id}; a guest booking leaves it NULL (AC-1 / AC-2). Tested at the persistence
 * seam — {@link Bookings#insertAwaitingPayment} with and without an account id — against real Postgres
 * (the nullable column + FK are DB behaviour). Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcBookingsAccountLinkIT {

	@Autowired
	Bookings bookings;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long guest(String email) {
		return jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", email).query(Long.class).single();
	}

	private long account(String email) {
		return jdbc.sql("INSERT INTO customer_account (email, password_hash) VALUES (:e, '{bcrypt}x') RETURNING id")
				.param("e", email).query(Long.class).single();
	}

	/** The nullable account_id of a booking row — null when the column is SQL NULL. */
	private Long accountIdOf(long bookingId) {
		return jdbc.sql("SELECT account_id FROM booking WHERE id = :id")
				.param("id", bookingId)
				.query(Long.class)
				.optional()
				.orElse(null);
	}

	@Test
	void persistsAccountIdWhenPresent() {
		SetRef set = onlineSet();
		long guestId = guest("linkacc01@example.com");
		long accountId = account("linkacc01@example.com");

		OptionalLong id = bookings.insertAwaitingPayment(new NewBooking(
				"LINKACC0001", new VenueId(set.venueId()), new SetId(set.setId()),
				new CustomerId(guestId), new CustomerAccountId(accountId),
				LocalDate.of(2027, 8, 10), 4500L, "EUR"));

		assertTrue(id.isPresent(), "the booking inserted");
		assertEquals(accountId, accountIdOf(id.getAsLong()),
				"a signed-in booking carries the CustomerAccountId (AC-1)");
	}

	@Test
	void leavesAccountIdNullForGuest() {
		SetRef set = onlineSet();
		long guestId = guest("linkguest01@example.com");

		OptionalLong id = bookings.insertAwaitingPayment(new NewBooking(
				"LINKGUEST01", new VenueId(set.venueId()), new SetId(set.setId()),
				new CustomerId(guestId), null,
				LocalDate.of(2027, 8, 11), 4500L, "EUR"));

		assertTrue(id.isPresent(), "the guest booking inserted");
		assertNull(accountIdOf(id.getAsLong()), "a guest booking leaves account_id NULL (AC-2)");
	}
}
