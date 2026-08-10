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
 * module owns that table, so the "does this venue have any booking?" probe lives here while the layout
 * write it guards stays in {@code venue}. Invariant #1: explicit SQL via {@link JdbcClient},
 * no JPA.
 *
 * <p>This is the implementing side of a dependency-inverted <strong>driven (SPI) port</strong>
 * (declared in {@code venue.spi}). The legal {@code booking → venue} edge (granted as {@code venue::api}
 * for {@link VenueId} and {@code venue::spi} for {@link BookingPresence}) lets us reference these here;
 * {@code venue} never imports {@code booking}, so {@code ModularityTests} stays cycle-free. The adapter
 * depends only on {@link JdbcClient}, so the Spring bean graph is acyclic too.
 *
 * <p>Any booking row — any status, incl. terminal — counts as present, because any booking pins its set
 * via the {@code booking.set_id} FK; so the query filters on {@code venue_id} only. The predicate is
 * served by the existing {@code booking_venue_id_idx} (V5); no new index is needed.
 */
@Repository
class JdbcBookingPresence implements BookingPresence {

	/**
	 * The statuses a booking can still be honoured from — everything the lifecycle has not yet
	 * ended. Derived from {@link BookingStatus} rather than listed by hand so a new live state
	 * cannot silently fall out of the edit guard; the terminal legs are the exclusions.
	 */
	private static final List<String> LIVE_STATUSES = Stream.of(BookingStatus.values())
			.filter(status -> !status.isTerminal())
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
