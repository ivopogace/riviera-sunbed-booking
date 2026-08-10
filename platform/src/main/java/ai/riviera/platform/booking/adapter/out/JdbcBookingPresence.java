package ai.riviera.platform.booking.adapter.out;

import java.util.List;
import java.util.stream.Stream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.domain.BookingStatus;

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
 * <p>Two questions, three probes. The {@code hasBookings} pair counts a booking of <strong>any</strong>
 * status including terminal, because any booking pins its set via the {@code booking.set_id} FK — that
 * is the delete guard, venue-wide for the bulk replace and set-scoped for the per-set remove.
 * {@code hasLiveBookings} counts only bookings that can still be honoured — the edit guard, where
 * finished history strands nobody. Indexes: {@code booking_venue_id_idx} serves the venue-scoped
 * probe and {@code booking_set_date_idx}'s leftmost prefix the set-scoped ones (both V5); no new index.
 */
@Repository
class JdbcBookingPresence implements BookingPresence {

	/**
	 * The statuses a guest may still turn up on. Derived from {@link BookingStatus} rather than
	 * listed by hand, so a newly added live state cannot silently fall out of the edit guard.
	 */
	private static final List<String> LIVE_STATUSES = Stream.of(BookingStatus.values())
			.filter(BookingStatus::canStillBeHonoured)
			.map(Enum::name)
			.toList();

	private final JdbcClient jdbc;

	JdbcBookingPresence(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean hasBookings(VenueId venueId) {
		return jdbc.sql("SELECT EXISTS(SELECT 1 FROM booking WHERE venue_id = :venue)")
				.param("venue", venueId.value())
				.query(Boolean.class)
				.single();
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
}
