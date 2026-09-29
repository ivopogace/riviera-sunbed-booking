package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.application.refund.GuestBookingDay;
import ai.riviera.platform.booking.application.refund.GuestBookingDays;
import ai.riviera.platform.booking.application.refund.GuestBookingRow;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * {@link GuestBookingDays} over {@code booking} and {@code booking_day}: the contact's bookings by
 * {@code booking_customer_id_idx}, then their days in one {@code IN} read grouped in memory. The day's
 * state is read off the stamps in precedence order: attended, released, refunded, else open. Package-private
 * driven adapter (invariant #11), explicit SQL (invariant #1).
 */
@Repository
class JdbcGuestBookingDays implements GuestBookingDays {

	/** The port's cap — an unbounded read behind a support search is a hazard, not a feature. */
	private static final int MAX_BOOKINGS = 20;

	private final JdbcClient jdbc;

	JdbcGuestBookingDays(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	private record Head(long id, long setId, LocalDate firstDate, LocalDate lastDate, String status) {
	}

	private record Day(long bookingId, GuestBookingDay day) {
	}

	@Override
	public List<GuestBookingRow> forCustomer(CustomerId customerId) {
		List<Head> heads = jdbc.sql("""
				SELECT id, set_id, booking_date, last_date, status
				FROM booking
				WHERE customer_id = :customer
				ORDER BY booking_date DESC, id DESC
				LIMIT :limit
				""")
				.param("customer", customerId.value())
				.param("limit", MAX_BOOKINGS)
				.query((rs, rowNum) -> new Head(rs.getLong("id"), rs.getLong("set_id"),
						rs.getObject("booking_date", LocalDate.class), rs.getObject("last_date", LocalDate.class),
						rs.getString("status")))
				.list();
		if (heads.isEmpty()) {
			return List.of();
		}
		Map<Long, List<GuestBookingDay>> days = jdbc.sql("""
				SELECT booking_id, service_date,
				       CASE WHEN attended_at IS NOT NULL THEN 'ATTENDED'
				            WHEN released_at IS NOT NULL THEN 'RELEASED'
				            WHEN refunded_at IS NOT NULL THEN 'REFUNDED'
				            ELSE 'OPEN' END AS state
				FROM booking_day
				WHERE booking_id IN (:ids)
				ORDER BY booking_id, service_date
				""")
				.param("ids", heads.stream().map(Head::id).toList())
				.query((rs, rowNum) -> new Day(rs.getLong("booking_id"), new GuestBookingDay(
						rs.getObject("service_date", LocalDate.class), GuestBookingDay.State.valueOf(rs.getString("state")))))
				.list().stream()
				.collect(Collectors.groupingBy(Day::bookingId, Collectors.mapping(Day::day, Collectors.toList())));
		return heads.stream()
				.map(head -> new GuestBookingRow(new BookingId(head.id()), new SetId(head.setId()), head.firstDate(),
						head.lastDate(), BookingStatus.valueOf(head.status()), days.getOrDefault(head.id(), List.of())))
				.toList();
	}
}
