package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link DailyTakings} — the per-{@code (venue, date)} gross online takings
 * of settled bookings, summed in SQL via {@link JdbcClient} (invariant #1, no JPA). Package-private; only the
 * {@code api/} port is referenced cross-module (by {@code payout}, invariant #11). Read-only: it
 * sums {@code booking} amounts and mutates nothing — no availability write (invariant #2) and
 * never the payout ledger.
 */
@Repository
class JdbcDailyTakings implements DailyTakings {

	/** v1 collection currency (invariant #5) — the empty-day and single-currency fallback. */
	private static final String DEFAULT_CURRENCY = "EUR";

	private final JdbcClient jdbc;

	JdbcDailyTakings(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * The money the venue kept on {@code date}: {@code CONFIRMED}, {@code COMPLETED} and
	 * {@code NO_SHOW} bookings whose first service day it is (whole stay price, no pool filter);
	 * an empty day is {@code (0, 'EUR')} (invariant #5). Rationale: RESPONSIBILITIES.md §booking.
	 */
	@Override
	public OnlineTakings grossOnlineTakings(VenueId venueId, LocalDate date) {
		return jdbc.sql("""
				SELECT COALESCE(SUM(amount_minor), 0)                    AS gross_minor,
				       COALESCE(MAX(amount_currency), :fallbackCurrency) AS currency
				FROM booking
				WHERE venue_id = :venue AND booking_date = :date
				  AND status IN (:confirmed, :completed, :noShow)
				""")
				.param("venue", venueId.value())
				.param("date", date)
				.param("confirmed", BookingStatus.CONFIRMED.name())
				.param("completed", BookingStatus.COMPLETED.name())
				.param("noShow", BookingStatus.NO_SHOW.name())
				.param("fallbackCurrency", DEFAULT_CURRENCY)
				.query((rs, rowNum) -> new OnlineTakings(
						rs.getLong("gross_minor"), rs.getString("currency")))
				.single();
	}
}
