package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.domain.BookingStatus;

import ai.riviera.platform.venue.vocabulary.LiveBookingCounts;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.spi.BookingPresence;

/**
 * Answers {@code venue}'s {@link BookingPresence} from the {@code booking} table this module owns
 * (invariant #1: explicit {@link JdbcClient} SQL). {@code hasBookings} counts any status, and a set a
 * remodel receipt names as a move's old or new spot, since each pins the set by FK: that decides
 * retire-or-delete. The live probes count only {@link #LIVE_STATUSES}; {@code liveBookingsFrom} reads
 * {@code last_date}, so a stay still running on the day is owed its remaining days. Served by
 * {@code booking_venue_id_idx} and {@code booking_set_date_idx} (V5); no new index.
 */
@Repository
class JdbcBookingPresence implements BookingPresence {

	/**
	 * The statuses a guest may still turn up on. Derived from {@link BookingStatus} rather than
	 * listed by hand, so a newly added live state cannot silently fall out of the edit guard.
	 */
	static final List<String> LIVE_STATUSES = Stream.of(BookingStatus.values())
			.filter(BookingStatus::canStillBeHonoured)
			.map(Enum::name)
			.toList();

	private final JdbcClient jdbc;

	JdbcBookingPresence(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean hasBookings(SetId setId) {
		// booking_set_date_idx (V5) and remodel_receipt_move_from_set_idx (V52) serve the two arms.
		return jdbc.sql("""
				SELECT EXISTS(SELECT 1 FROM booking WHERE set_id = :set)
				    OR EXISTS(SELECT 1 FROM remodel_receipt_move WHERE from_set_id = :set OR to_set_id = :set)
				""")
				.param("set", setId.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public boolean hasLiveBookings(SetId setId) {
		return jdbc.sql("""
				SELECT EXISTS(SELECT 1 FROM booking
				               WHERE set_id = :set AND status IN (:live))
				""")
				.param("set", setId.value())
				.param("live", LIVE_STATUSES)
				.query(Boolean.class)
				.single();
	}

	@Override
	public Map<SetId, LocalDate> nearestLiveBookings(Collection<SetId> setIds) {
		if (setIds.isEmpty()) {
			return Map.of(); // no IN-list — avoid an empty "IN ()" and a needless round-trip
		}
		List<Long> ids = setIds.stream().map(SetId::value).toList();
		// The same live filter as hasLiveBookings, grouped; booking_set_date_idx serves both columns.
		return jdbc.sql("""
				SELECT set_id, MIN(booking_date) AS nearest
				FROM booking
				WHERE set_id IN (:ids) AND status IN (:live)
				GROUP BY set_id
				""")
				.param("ids", ids)
				.param("live", LIVE_STATUSES)
				.query((rs, rowNum) -> Map.entry(
						new SetId(rs.getLong("set_id")), rs.getObject("nearest", LocalDate.class)))
				.list()
				.stream()
				.collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	@Override
	public LiveBookingCounts liveBookingsFrom(VenueId venueId, LocalDate from) {
		// A pending request is owed an answer; every other live status is a guest still coming.
		return jdbc.sql("""
				SELECT COUNT(*) FILTER (WHERE status <> :pending) AS future_bookings,
				       COUNT(*) FILTER (WHERE status = :pending) AS pending_requests
				FROM booking
				WHERE venue_id = :venue AND last_date >= :from AND status IN (:live)
				""")
				.param("venue", venueId.value())
				.param("from", from)
				.param("live", LIVE_STATUSES)
				.param("pending", BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new LiveBookingCounts(
						rs.getInt("future_bookings"), rs.getInt("pending_requests")))
				.single();
	}
}
