package ai.riviera.platform.venue.adapter.out;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
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
import ai.riviera.platform.venue.vocabulary.VenueStayFacts;

/**
 * JDBC adapter implementing {@link SetBookingFacts} (invariant #1). Two statements read
 * {@code set_position} bare and are exempt by name in {@code RetiredSetExclusionArchitectureTests}
 * (ADR-0019): {@code SET_BOOKING_INFO_SELECT}, so a booking on a retired set still resolves to the
 * spot its guests were told, and {@code VENUES_OF_SETS_LOCK}, which hands out no set. Every other
 * statement here is held like any other class's: the view, or {@code retired_at IS NULL}.
 */
@Repository
class JdbcSetBookingFacts implements SetBookingFacts {

	/** SQL named-param key bound to a venue id in the reads below (named, not duplicated — S1192). */
	private static final String VENUE_PARAM = "venue";

	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_PRICE_MINOR = "price_minor";
	private static final String COL_PRICE_CURRENCY = "price_currency";

	/** The set-facts columns shared by every booking-info read — one SQL shape, one mapper. */
	private static final String SET_BOOKING_INFO_COLUMNS = """
			SELECT sp.id AS set_id, sp.venue_id, v.name AS venue_name, sp.row_label,
			       sp.position_no, sp.pool, sp.price_minor, sp.price_currency, v.booking_cutoff,
			       v.sales_close, v.booking_mode, v.closed_at, v.reopen_on, v.advance_sales,
			       v.max_stay_days
			""";

	/** Exempt by name: the booking-info read still answers for a retired set with the spot its guests were told. */
	private static final String SET_BOOKING_INFO_SELECT = SET_BOOKING_INFO_COLUMNS + """
			FROM set_position sp
			JOIN venue v ON v.id = sp.venue_id
			""";

	/**
	 * The ForReserve twins' venue lock, exempt by name because it hands out no set: it locks venues, and
	 * the view read that follows is the retired-set fence.
	 */
	private static final String VENUES_OF_SETS_LOCK = """
			SELECT v.id FROM venue v
			WHERE v.id IN (SELECT sp.venue_id FROM set_position sp WHERE sp.id IN (:setIds))
			ORDER BY v.id
			FOR SHARE
			""";

	/** The reserve's booking-info read selects the active map: a retired set is no spot to book (#1284). */
	private static final String ACTIVE_SET_BOOKING_INFO_SELECT = SET_BOOKING_INFO_COLUMNS + """
			FROM active_set_position sp
			JOIN venue v ON v.id = sp.venue_id
			""";

	/**
	 * The reserve's set lock, as {@link #poolForClaim}'s: a single-set retire holds the row {@code FOR UPDATE}
	 * without the venue lock, so the reserve waits for it here and the view predicate is re-checked after the wait.
	 */
	private static final String RESERVE_SET_LOCK = " FOR KEY SHARE OF sp";

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
		return bookingInfo(SET_BOOKING_INFO_SELECT, setId, "");
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
		return bookingInfos(SET_BOOKING_INFO_SELECT, setIds, "");
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfoForReserve(SetId setId) {
		lockVenuesOf(List.of(setId));
		return bookingInfo(ACTIVE_SET_BOOKING_INFO_SELECT, setId, RESERVE_SET_LOCK);
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfosForReserve(Collection<SetId> setIds) {
		lockVenuesOf(setIds);
		return bookingInfos(ACTIVE_SET_BOOKING_INFO_SELECT, setIds, " ORDER BY sp.id" + RESERVE_SET_LOCK);
	}

	private Optional<SetBookingInfo> bookingInfo(String select, SetId setId, String tail) {
		return jdbc.sql(select + "WHERE sp.id = :id" + tail)
				.param("id", setId.value())
				.query(JdbcSetBookingFacts::mapSetBookingInfo)
				.optional();
	}

	private Map<SetId, SetBookingInfo> bookingInfos(String select, Collection<SetId> setIds, String tail) {
		if (setIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql(select + "WHERE sp.id IN (:setIds)" + tail)
				.param("setIds", setIds.stream().map(SetId::value).toList())
				.query(JdbcSetBookingFacts::mapSetBookingInfo)
				.list().stream()
				.collect(Collectors.toMap(SetBookingInfo::setId, info -> info));
	}

	@Override
	public void lockVenueForClaim(VenueId venueId) {
		jdbc.sql("SELECT id FROM venue WHERE id = :venue FOR SHARE")
				.param(VENUE_PARAM, venueId.value())
				.query(Long.class)
				.optional();
	}

	/** In a statement of its own, so the read that follows runs on a snapshot taken after any closure it waited on. */
	private void lockVenuesOf(Collection<SetId> setIds) {
		if (setIds.isEmpty()) {
			return;
		}
		jdbc.sql(VENUES_OF_SETS_LOCK)
				.param("setIds", setIds.stream().map(SetId::value).toList())
				.query(Long.class)
				.list();
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
								rs.getBoolean("advance_sales")),
				rs.getObject("max_stay_days", Integer.class));
	}

	@Override
	public List<SetSpot> activeSetsOf(VenueId venueId) {
		return jdbc.sql(ACTIVE_SPOTS_SELECT + "ORDER BY id")
				.param(VENUE_PARAM, venueId.value())
				.query(JdbcSetBookingFacts::mapSetSpot)
				.list();
	}

	@Override
	public Map<VenueId, VenueStayFacts> stayFactsOf(Collection<VenueId> venueIds) {
		if (venueIds.isEmpty()) {
			return Map.of(); // no IN-list — avoid an empty "IN ()" and a needless round-trip
		}
		List<Long> ids = venueIds.stream().map(VenueId::value).toList();
		Map<VenueId, Integer> maxima = new LinkedHashMap<>();
		Map<VenueId, List<SetId>> online = new LinkedHashMap<>();
		jdbc.sql("""
				SELECT v.id AS venue_id, v.max_stay_days, sp.id AS set_id
				FROM venue v
				LEFT JOIN active_set_position sp ON sp.venue_id = v.id AND sp.pool = :pool
				WHERE v.id IN (:ids)
				ORDER BY v.id, sp.id
				""")
				.param("ids", ids)
				.param("pool", Pool.ONLINE.name())
				.query(rs -> {
					VenueId venue = new VenueId(rs.getLong(COL_VENUE_ID));
					maxima.put(venue, rs.getObject("max_stay_days", Integer.class));
					List<SetId> sets = online.computeIfAbsent(venue, id -> new ArrayList<>());
					long setId = rs.getLong("set_id");
					if (!rs.wasNull()) {
						sets.add(new SetId(setId));
					}
				});
		return maxima.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getKey,
				entry -> new VenueStayFacts(List.copyOf(online.get(entry.getKey())), entry.getValue())));
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
