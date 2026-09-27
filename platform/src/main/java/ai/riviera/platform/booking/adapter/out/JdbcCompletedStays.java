package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * Answers {@link CompletedStays} from the {@code booking} table in explicit SQL (invariant #1): did
 * this stay complete, and when. {@code completed_at} is the instant the stay resolved {@code COMPLETED};
 * the review window and the eligibility verdict stay in {@code review}, which this inverted port keeps
 * a leaf. A stay's code names its last completed stretch once no stretch is still live (design D6); a
 * stretch's row code names nothing. Rationale: RESPONSIBILITIES.md §booking.
 */
@Repository
class JdbcCompletedStays implements CompletedStays {

	private static final String CODE = "code";
	private static final String COMPLETED = BookingStatus.COMPLETED.name();

	private final JdbcClient jdbc;

	JdbcCompletedStays(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<CompletedStay> byCode(String bookingCode) {
		return jdbc.sql("""
				SELECT b.id, b.venue_id, b.booking_date, b.completed_at FROM booking b
				WHERE %s AND b.status = :completed AND b.completed_at IS NOT NULL
				  AND NOT EXISTS (SELECT 1 FROM booking o WHERE o.stay_id = b.stay_id AND o.status IN (:live))
				ORDER BY b.booking_date DESC
				LIMIT 1
				""".formatted(JdbcBookings.CODE_MATCH))
				.param(CODE, bookingCode)
				.param("completed", COMPLETED)
				.param("live", JdbcBookingPresence.LIVE_STATUSES)
				.query((rs, rowNum) -> new CompletedStay(new BookingRef(rs.getLong("id")),
						new VenueRef(rs.getLong("venue_id")),
						rs.getObject("booking_date", LocalDate.class),
						rs.getTimestamp("completed_at").toInstant()))
				.optional();
	}

	@Override
	public boolean existsByCode(String bookingCode) {
		return Boolean.TRUE.equals(jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM booking b WHERE %s)
				""".formatted(JdbcBookings.CODE_MATCH))
				.param(CODE, bookingCode)
				.query(Boolean.class)
				.single());
	}
}
