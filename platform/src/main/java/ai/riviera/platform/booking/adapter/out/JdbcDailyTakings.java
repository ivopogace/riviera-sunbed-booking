package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.DayShare;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link DailyTakings} — the per-{@code (venue, date)} gross online takings of
 * settled bookings covering the date, each counted at its {@link DayShare} of the day, read via
 * {@link JdbcClient} (invariant #1, no JPA). Package-private; only the {@code api/} port is
 * referenced cross-module (by {@code payout}, invariant #11). Read-only: it sums {@code booking}
 * amounts and mutates nothing — no availability write (invariant #2) and never the payout ledger.
 */
@Repository
class JdbcDailyTakings implements DailyTakings {

	/** v1 collection currency (invariant #5) — the empty-day and single-currency fallback. */
	private static final String DEFAULT_CURRENCY = "EUR";

	private final JdbcClient jdbc;

	JdbcDailyTakings(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** One settled booking whose span covers the date, as the day's share is computed from it. */
	private record Covering(long amountMinor, String currency, LocalDate firstDay, LocalDate lastDay) {
	}

	/**
	 * The day's share of every {@code CONFIRMED}/{@code COMPLETED}/{@code NO_SHOW} booking covering
	 * {@code date} (design D4; no pool filter); an empty day is {@code (0, 'EUR')} (invariant #5).
	 * Rationale: RESPONSIBILITIES.md §booking. Served by {@code booking_venue_id_idx}.
	 */
	@Override
	public OnlineTakings grossOnlineTakings(VenueId venueId, LocalDate date) {
		List<Covering> covering = jdbc.sql("""
				SELECT amount_minor, amount_currency, booking_date, last_date
				FROM booking
				WHERE venue_id = :venue AND booking_date <= :date AND last_date >= :date
				  AND status IN (:confirmed, :completed, :noShow)
				""")
				.param("venue", venueId.value())
				.param("date", date)
				.param("confirmed", BookingStatus.CONFIRMED.name())
				.param("completed", BookingStatus.COMPLETED.name())
				.param("noShow", BookingStatus.NO_SHOW.name())
				.query((rs, rowNum) -> new Covering(rs.getLong("amount_minor"), rs.getString("amount_currency"),
						rs.getObject("booking_date", LocalDate.class), rs.getObject("last_date", LocalDate.class)))
				.list();
		long gross = covering.stream()
				.mapToLong(b -> DayShare.on(b.amountMinor(), b.firstDay(), b.lastDay(), date))
				.reduce(0L, Math::addExact);
		String currency = covering.stream().map(Covering::currency).max(Comparator.naturalOrder())
				.orElse(DEFAULT_CURRENCY);
		return new OnlineTakings(gross, currency);
	}
}
