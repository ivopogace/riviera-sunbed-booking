package ai.riviera.platform.availability.adapter.out;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;

/**
 * JDBC adapter answering {@link SetAvailabilityLookup} from the {@code set_availability} source
 * of truth (invariant #2) — the {@code availability} module owns that table, so the live-map
 * read lives here while the map assembly stays in {@code venue} (issue #44). Invariant #1:
 * explicit SQL via {@link JdbcClient}, no JPA.
 *
 * <p>This is the implementing side of a dependency-inverted <strong>driven (SPI) port</strong>
 * (declared in {@code venue.spi}). The legal {@code availability → venue} edge (granted as
 * {@code venue::api} for {@link SetId} and {@code venue::spi} for {@link SetAvailabilityLookup})
 * lets us reference these here; {@code venue} never imports {@code availability}, so
 * {@code ModularityTests} stays cycle-free. The adapter depends only on {@link JdbcClient}, so
 * the Spring bean graph is acyclic too.
 *
 * <p>A row's mere existence means taken (its {@code state} — {@code BOOKED_ONLINE} or, later,
 * {@code STAFF_MARKED} — is irrelevant to "is it free?"), so the query selects {@code set_id}
 * without filtering on {@code state}. The predicate is served by the existing
 * {@code UNIQUE(set_id, booking_date)} composite index; no new index is needed.
 */
@Repository
class JdbcSetAvailabilityLookup implements SetAvailabilityLookup {

	private final JdbcClient jdbc;

	JdbcSetAvailabilityLookup(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Set<SetId> takenOn(Collection<SetId> setIds, LocalDate date) {
		if (setIds.isEmpty()) {
			return Set.of(); // no IN-list — avoid an empty "IN ()" and a needless round-trip
		}
		List<Long> ids = setIds.stream().map(SetId::value).toList();
		List<Long> taken = jdbc.sql("""
				SELECT set_id
				FROM set_availability
				WHERE booking_date = :date
				  AND set_id IN (:ids)
				""")
				.param("date", date)
				.param("ids", ids)
				.query(Long.class)
				.list();
		return taken.stream().map(SetId::new).collect(Collectors.toUnmodifiableSet());
	}
}
