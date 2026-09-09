package ai.riviera.retirefixture.venue.adapter.out;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The exempt port's adapter: it implements {@link SetBookingFacts} and reads the bare table, because
 * a booking on a retired set must still resolve to its spot. Must pass despite the bare read.
 */
final class FixtureSetFacts implements SetBookingFacts {

	static final String FACTS_SQL = """
			SELECT sp.id, sp.row_label, sp.position_no
			FROM set_position sp
			JOIN venue v ON v.id = sp.venue_id
			WHERE sp.id = :id
			""";

	@Override
	public Optional<Pool> poolForClaim(SetId setId) {
		return Optional.empty();
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
		return Optional.empty();
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
		return Map.of();
	}

	@Override
	public List<SetSpot> activeSetsOf(VenueId venueId) {
		return List.of();
	}

	@Override
	public List<SetSpot> freeOnlineSetsOn(VenueId venueId, LocalDate date) {
		return List.of();
	}
}
