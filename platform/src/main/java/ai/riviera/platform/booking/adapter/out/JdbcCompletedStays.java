package ai.riviera.platform.booking.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * JDBC adapter answering {@link CompletedStays} from the {@code booking} table — the {@code booking}
 * module owns that table, so the "was this stay checked in, and when?" probe lives here while the
 * review window and the eligibility verdict stay in {@code review}. Invariant #1: explicit SQL via
 * {@link JdbcClient}, no JPA.
 *
 * <p>This is the implementing side of a dependency-inverted <strong>driven (SPI) port</strong>
 * (declared in {@code review.spi}). The legal {@code booking → review} edge is what keeps
 * {@code review} a leaf; {@code review} never imports {@code booking}, so {@code ModularityTests}
 * stays cycle-free. The same shape as {@code JdbcGuestBookingHistory}.
 *
 * <p>Its own query rather than a widened {@code findByCode}: the view path's read model is a
 * different conversation, and admitting a status filter to it for this caller would couple them.
 * The {@code COMPLETED} token is the one {@code booking_status_check} lists.
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
				SELECT id, venue_id, completed_at FROM booking
				WHERE code = :code AND status = :completed AND completed_at IS NOT NULL
				""")
				.param(CODE, bookingCode)
				.param("completed", COMPLETED)
				.query((rs, rowNum) -> new CompletedStay(new BookingRef(rs.getLong("id")),
						new VenueRef(rs.getLong("venue_id")),
						rs.getTimestamp("completed_at").toInstant()))
				.optional();
	}

	@Override
	public boolean existsByCode(String bookingCode) {
		return Boolean.TRUE.equals(jdbc.sql("SELECT EXISTS (SELECT 1 FROM booking WHERE code = :code)")
				.param(CODE, bookingCode)
				.query(Boolean.class)
				.single());
	}
}
