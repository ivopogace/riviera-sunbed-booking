package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.CustomerBookings;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * {@link CustomerBookings} over the {@code booking} table (#380). Package-private driven adapter
 * (invariant #11), {@code JdbcClient} + explicit SQL.
 *
 * <p>The read rides the {@code booking_customer_id_idx} index V5 created for exactly this shape of
 * lookup; the {@code LIMIT} is the port's contract, not an optimisation.
 */
@Repository
class JdbcCustomerBookings implements CustomerBookings {

	/** The port's cap — an unbounded read behind a support search is a hazard, not a feature. */
	private static final int MAX_BOOKINGS = 20;

	private final JdbcClient jdbc;

	JdbcCustomerBookings(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public List<CustomerBookingSummary> forCustomer(CustomerId customerId) {
		return jdbc.sql("""
				SELECT id, venue_id, booking_date, confirmed_at IS NOT NULL AS ever_confirmed
				FROM booking
				WHERE customer_id = :customer
				ORDER BY booking_date DESC, id DESC
				LIMIT :limit
				""")
				.param("customer", customerId.value())
				.param("limit", MAX_BOOKINGS)
				.query((rs, rowNum) -> new CustomerBookingSummary(
						new BookingId(rs.getLong("id")),
						new VenueId(rs.getLong("venue_id")),
						rs.getObject("booking_date", LocalDate.class),
						rs.getBoolean("ever_confirmed")))
				.list();
	}
}
