package ai.riviera.platform.booking.adapter.out;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

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
}
