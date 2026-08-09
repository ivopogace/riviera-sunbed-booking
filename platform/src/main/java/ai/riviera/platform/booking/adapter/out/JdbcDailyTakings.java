package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link DailyTakings} — the per-{@code (venue, date)} gross confirmed-online
 * takings, summed in SQL via {@link JdbcClient} (invariant #1, no JPA). Package-private; only the
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
	 * Sums every status in which the venue kept the money — {@code CONFIRMED}, {@code COMPLETED} and
	 * {@code NO_SHOW} alike, so neither a check-in nor the no-show sweep shrinks the venue's day (a
	 * paid no-show is not refunded: the cancellation window closed at 00:00 on the service date,
	 * invariant #10). Aggregated in SQL for one service date ({@code booking_date} in
	 * {@code Europe/Tirane}, invariant #6), served by {@code booking_venue_id_idx}. No pool filter is
	 * needed for "online": a booking row only ever exists for an online-pool set (invariant #3 —
	 * walk-ins are staff-marked availability rows, never bookings). {@code COALESCE} keeps an empty
	 * day a {@code (0, 'EUR')} result (invariant #5).
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
