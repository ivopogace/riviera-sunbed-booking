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
import ai.riviera.platform.venue.vocabulary.VenueStayFacts;

/**
 * The facts port's adapter: it implements {@link SetBookingFacts} and reads the bare table only in
 * the two constants exempt by name, because a booking on a retired set must still resolve to its
 * spot; its spot read takes the view like any other class's. Must pass.
 */
class FixtureSetFacts implements SetBookingFacts {

	static final String SET_BOOKING_INFO_SELECT = """
			SELECT sp.id, sp.row_label, sp.position_no
			FROM set_position sp
			JOIN venue v ON v.id = sp.venue_id
			WHERE sp.id = :id
			""";

	static final String VENUES_OF_SETS_LOCK = """
			SELECT v.id FROM venue v
			WHERE v.id IN (SELECT sp.venue_id FROM set_position sp WHERE sp.id IN (:setIds))
			ORDER BY v.id
			FOR SHARE
			""";

	static final String ACTIVE_SPOTS_SELECT = """
			SELECT id, row_label, position_no, grid_x, grid_y, tier, pool
			FROM active_set_position
			WHERE venue_id = :venue
			""";

	@Override
	public boolean sellsOnlineOn(VenueId venueId, LocalDate date) {
		return false;
	}

	@Override
	public Optional<Pool> poolForClaim(SetId setId) {
		return Optional.empty();
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
		return Optional.empty();
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfoForReserve(SetId setId) {
		return setBookingInfo(setId);
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfosForReserve(Collection<SetId> setIds) {
		return setBookingInfos(setIds);
	}

	@Override
	public void lockVenueForClaim(VenueId venueId) {
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

	@Override
	public Map<VenueId, VenueStayFacts> stayFactsOf(Collection<VenueId> venueIds) {
		return Map.of();
	}
}
