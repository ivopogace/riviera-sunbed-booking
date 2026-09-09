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
 * JDBC adapter answering {@link BookingPresence} from the {@code booking} table — the {@code booking}
 * module owns that table, so the booking-presence probes live here while the layout writes they guard
 * stay in {@code venue}. Invariant #1: explicit SQL via {@link JdbcClient}, no JPA.
 *
 * <p>This is the implementing side of a dependency-inverted <strong>driven (SPI) port</strong>
 * (declared in {@code venue.spi}). The legal {@code booking → venue} edge (granted as {@code venue::api}
 * for {@link VenueId} and {@code venue::spi} for {@link BookingPresence}) lets us reference these here;
 * {@code venue} never imports {@code booking}, so {@code ModularityTests} stays cycle-free. The adapter
 * depends only on {@link JdbcClient}, so the Spring bean graph is acyclic too.
 *
 * <p>Three questions, four probes. {@code hasBookings} counts a booking of <strong>any</strong>
 * status including terminal, because any booking pins its set via the {@code booking.set_id} FK —
 * that is the retire-or-delete decision of every removal. {@code hasLiveBookings} and its batch
 * twin {@code nearestLiveBookings} count only bookings that can still be honoured — the edit, remove
 * and bulk-save guards, where finished history strands nobody. {@code liveBookingsFrom} counts what
 * a venue's guests are still owed from a day on — the close-for-season response. Indexes:
 * {@code booking_venue_id_idx} serves the venue-scoped probe and {@code booking_set_date_idx}'s
 * leftmost prefix the set-scoped ones (both V5); no new index.
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
		// Served by booking_set_date_idx (set_id, booking_date) on its leftmost prefix (V5).
		return jdbc.sql("SELECT EXISTS(SELECT 1 FROM booking WHERE set_id = :set)")
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
				WHERE venue_id = :venue AND booking_date >= :from AND status IN (:live)
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
