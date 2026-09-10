package ai.riviera.platform.venue.adapter.out;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.spi.SalesWindow;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.Tier;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter implementing the {@link SetBookingFacts} port directly (invariant #1, no JPA; a
 * single adapter is a hypothetical seam). Its own class rather than a third surface on
 * {@link JdbcVenueCatalog} because the two read the set table differently: every catalogue read
 * forgets a retired set, while the facts reads must keep answering for one — a booking, a mail
 * and the staff lookup still name the spot the guest was told (ADR-0019). The fitness function
 * that holds every other set read to the active view exempts the class implementing this port.
 */
@Repository
class JdbcSetBookingFacts implements SetBookingFacts {

	/** SQL named-param key bound to a venue id in the reads below (named, not duplicated — S1192). */
	private static final String VENUE_PARAM = "venue";

	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_PRICE_MINOR = "price_minor";
	private static final String COL_PRICE_CURRENCY = "price_currency";

	/** The set-facts row shared by the single-id and batch reads — one SQL shape, one mapper. */
	private static final String SET_BOOKING_INFO_SELECT = """
			SELECT sp.id AS set_id, sp.venue_id, v.name AS venue_name, sp.row_label,
			       sp.position_no, sp.pool, sp.price_minor, sp.price_currency, v.booking_cutoff,
			       v.sales_close, v.booking_mode, v.closed_at, v.reopen_on, v.advance_sales
			FROM set_position sp
			JOIN venue v ON v.id = sp.venue_id
			""";

	/** The spot reads select the active map: a retired set is neither a claim's spot nor a candidate. */
	private static final String ACTIVE_SPOTS_SELECT = """
			SELECT id, row_label, position_no, grid_x, grid_y, tier, pool
			FROM active_set_position
			WHERE venue_id = :venue
			""";

	private final JdbcClient jdbc;
	private final SetAvailabilityLookup availability;
	private final SalesWindow salesWindow;
	private final Clock clock;

	JdbcSetBookingFacts(JdbcClient jdbc, SetAvailabilityLookup availability, SalesWindow salesWindow,
			Clock clock) {
		this.jdbc = jdbc;
		this.availability = availability;
		this.salesWindow = salesWindow;
		this.clock = clock;
	}

	@Override
	public boolean sellsOnlineOn(VenueId venueId, LocalDate date) {
		return jdbc.sql("""
				SELECT sales_close, closed_at, reopen_on, advance_sales FROM venue WHERE id = :venue
				""")
				.param(VENUE_PARAM, venueId.value())
				.query((rs, rowNum) -> salesWindow.isOpen(rs.getObject("sales_close", LocalTime.class),
						rs.getObject("closed_at") == null
								? SeasonClosure.open()
								: SeasonClosure.closed(rs.getObject("reopen_on", LocalDate.class),
										rs.getBoolean("advance_sales")),
						date, clock.instant()))
				.optional()
				.orElse(false);
	}

	@Override
	public Optional<Pool> poolForClaim(SetId setId) {
		// FOR KEY SHARE through the view: the claim's own FK lock, and the view predicate is re-checked after the wait.
		return jdbc.sql("SELECT pool FROM active_set_position WHERE id = :id FOR KEY SHARE")
				.param("id", setId.value())
				.query(String.class)
				.optional()
				.map(Pool::valueOf);
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
		return jdbc.sql(SET_BOOKING_INFO_SELECT + "WHERE sp.id = :id")
				.param("id", setId.value())
				.query(JdbcSetBookingFacts::mapSetBookingInfo)
				.optional();
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
		if (setIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql(SET_BOOKING_INFO_SELECT + "WHERE sp.id IN (:setIds)")
				.param("setIds", setIds.stream().map(SetId::value).toList())
				.query(JdbcSetBookingFacts::mapSetBookingInfo)
				.list().stream()
				.collect(Collectors.toMap(SetBookingInfo::setId, info -> info));
	}

	private static SetBookingInfo mapSetBookingInfo(java.sql.ResultSet rs, int rowNum)
			throws java.sql.SQLException {
		return new SetBookingInfo(
				new SetId(rs.getLong("set_id")), new VenueId(rs.getLong(COL_VENUE_ID)),
				rs.getString("venue_name"), rs.getString("row_label"),
				rs.getInt("position_no"), Pool.valueOf(rs.getString("pool")),
				new MoneyView(rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)),
				rs.getObject("booking_cutoff", LocalTime.class),
				rs.getObject("sales_close", LocalTime.class),
				BookingMode.valueOf(rs.getString("booking_mode")),
				rs.getObject("closed_at") == null
						? SeasonClosure.open()
						: SeasonClosure.closed(rs.getObject("reopen_on", LocalDate.class),
								rs.getBoolean("advance_sales")));
	}

	@Override
	public List<SetSpot> activeSetsOf(VenueId venueId) {
		return jdbc.sql(ACTIVE_SPOTS_SELECT + "ORDER BY id")
				.param(VENUE_PARAM, venueId.value())
				.query(JdbcSetBookingFacts::mapSetSpot)
				.list();
	}

	@Override
	public List<SetSpot> freeOnlineSetsOn(VenueId venueId, LocalDate date) {
		List<SetSpot> online = jdbc.sql(ACTIVE_SPOTS_SELECT + "AND pool = :pool ORDER BY id")
				.param(VENUE_PARAM, venueId.value())
				.param("pool", Pool.ONLINE.name())
				.query(JdbcSetBookingFacts::mapSetSpot)
				.list();
		Set<SetId> taken = availability.takenOn(online.stream().map(SetSpot::setId).toList(), date);
		return online.stream().filter(spot -> !taken.contains(spot.setId())).toList();
	}

	private static SetSpot mapSetSpot(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
		return new SetSpot(new SetId(rs.getLong("id")),
				new SetPlacement(rs.getString("row_label"), rs.getInt("position_no"), rs.getInt("grid_x"),
						rs.getInt("grid_y")),
				Tier.valueOf(rs.getString("tier")), Pool.valueOf(rs.getString("pool")));
	}
}
