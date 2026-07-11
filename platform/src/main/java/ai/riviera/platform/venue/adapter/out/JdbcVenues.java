package ai.riviera.platform.venue.adapter.out;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalTime;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.NewVenueCommand;
import ai.riviera.platform.venue.application.RowPriceCommand;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.VenueProfileCommand;
import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.application.Venues;

/**
 * JDBC adapter implementing the {@link Venues} write port (invariant #1 — no JPA). Explicit
 * text-block SQL via {@link JdbcClient} with named params; package-private, so callers depend on
 * the port, not this class (invariant #11). Inserts use {@code RETURNING id} to surface the
 * identity PK. Rating/reviews/refund-policy columns take their DB defaults on insert (a new
 * venue has none).
 */
@Repository
class JdbcVenues implements Venues {

	/** Named-parameter keys reused across the set queries (must match the {@code :name} SQL refs). */
	private static final String P_SET_ID = "setId";
	private static final String P_VENUE = "venue";
	private static final String P_ROW_LABEL = "rowLabel";

	/** The set-position INSERT column/values, shared by the single-row and bulk paths (one column list). */
	private static final String INSERT_SET_SQL = """
			INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
			                          price_minor, price_currency, grid_x, grid_y)
			VALUES (:venue, :rowLabel, :positionNo, :tier, :pool,
			        :priceMinor, :priceCurrency, :gridX, :gridY)
			""";

	private final JdbcClient jdbc;

	JdbcVenues(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public long insertVenue(NewVenueCommand c) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, description, booking_mode,
				                   commission_bps, payout_currency, booking_cutoff)
				VALUES (:name, :beach, :region, :description, :mode, :bps, :currency, :cutoff)
				RETURNING id
				""")
				.param("name", c.name())
				.param("beach", c.beach())
				.param("region", c.region())
				.param("description", c.description())
				.param("mode", c.bookingMode())
				.param("bps", c.commissionBps())
				.param("currency", c.payoutCurrency())
				.param("cutoff", c.bookingCutoff())
				.query(Long.class)
				.single();
	}

	@Override
	public boolean venueExists(VenueId venueId) {
		return jdbc.sql("SELECT EXISTS(SELECT 1 FROM venue WHERE id = :id)")
				.param("id", venueId.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public boolean setExists(VenueId venueId, SetId setId) {
		return jdbc.sql("""
				SELECT EXISTS(SELECT 1 FROM set_position WHERE id = :setId AND venue_id = :venue)
				""")
				.param(P_SET_ID, setId.value())
				.param(P_VENUE, venueId.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public Optional<Conflict> findConflict(VenueId venueId, SetCommand c, Optional<SetId> exclude) {
		// One row carries the booleans for both layout-uniqueness rules; a NULL exclude id matches
		// nothing, so on add (no exclude) both checks see every existing row.
		Long excludeId = exclude.map(SetId::value).orElse(null);
		ConflictRow row = jdbc.sql("""
				SELECT
				  EXISTS(SELECT 1 FROM set_position
				         WHERE venue_id = :venue AND row_label = :rowLabel AND position_no = :positionNo
				           AND (:exclude::bigint IS NULL OR id <> :exclude)) AS position_taken,
				  EXISTS(SELECT 1 FROM set_position
				         WHERE venue_id = :venue AND grid_x = :gridX AND grid_y = :gridY
				           AND (:exclude::bigint IS NULL OR id <> :exclude)) AS cell_taken
				""")
				.param(P_VENUE, venueId.value())
				.param(P_ROW_LABEL, c.rowLabel())
				.param("positionNo", c.positionNo())
				.param("gridX", c.gridX())
				.param("gridY", c.gridY())
				.param("exclude", excludeId)
				.query((rs, rowNum) -> new ConflictRow(
						rs.getBoolean("position_taken"), rs.getBoolean("cell_taken")))
				.single();
		if (row.positionTaken()) {
			return Optional.of(Conflict.DUPLICATE_POSITION);
		}
		if (row.cellTaken()) {
			return Optional.of(Conflict.CELL_TAKEN);
		}
		return Optional.empty();
	}

	@Override
	public long insertSet(VenueId venueId, SetCommand c) {
		return jdbc.sql(INSERT_SET_SQL + "RETURNING id")
				.params(insertParams(venueId, c))
				.query(Long.class)
				.single();
	}

	@Override
	public int updateSet(VenueId venueId, SetId setId, SetCommand c) {
		Map<String, Object> params = new HashMap<>(setParams(c));
		params.put(P_VENUE, venueId.value());
		params.put(P_SET_ID, setId.value());
		return jdbc.sql("""
				UPDATE set_position
				SET row_label = :rowLabel, position_no = :positionNo, tier = :tier, pool = :pool,
				    price_minor = :priceMinor, price_currency = :priceCurrency,
				    grid_x = :gridX, grid_y = :gridY
				WHERE id = :setId AND venue_id = :venue
				""")
				.params(params)
				.update();
	}

	@Override
	public int deleteSet(VenueId venueId, SetId setId) {
		return jdbc.sql("DELETE FROM set_position WHERE id = :setId AND venue_id = :venue")
				.param(P_SET_ID, setId.value())
				.param(P_VENUE, venueId.value())
				.update();
	}

	@Override
	public int repriceRow(VenueId venueId, RowPriceCommand c) {
		// Non-destructive per-row reprice (O4, #174): overwrite only the price columns for every set
		// carrying the row label. The WHERE (venue_id, row_label) rides the set_position_cell_uniq
		// UNIQUE(venue_id, row_label, position_no) index prefix. Rows-affected 0 ⇒ unknown row.
		return jdbc.sql("""
				UPDATE set_position
				SET price_minor = :priceMinor, price_currency = :priceCurrency
				WHERE venue_id = :venue AND row_label = :rowLabel
				""")
				.param("priceMinor", c.priceMinor())
				.param("priceCurrency", c.priceCurrency())
				.param(P_VENUE, venueId.value())
				.param(P_ROW_LABEL, c.rowLabel())
				.update();
	}

	@Override
	public List<SetId> lockSetsOfVenue(VenueId venueId) {
		// FOR UPDATE locks the venue's set_position rows so a concurrent set_availability/booking
		// insert (which needs FOR KEY SHARE on the referenced row for its FK check) blocks until this
		// replace transaction ends — closing the invariant-#2 check-then-delete window (see Venues).
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :venue FOR UPDATE")
				.param(P_VENUE, venueId.value())
				.query(Long.class)
				.list()
				.stream()
				.map(SetId::new)
				.toList();
	}

	@Override
	public int deleteAllSets(VenueId venueId) {
		return jdbc.sql("DELETE FROM set_position WHERE venue_id = :venue")
				.param(P_VENUE, venueId.value())
				.update();
	}

	@Override
	public void insertSets(VenueId venueId, List<SetCommand> sets) {
		// One INSERT per set inside the caller's @Transactional boundary, sharing the single-row column
		// list (INSERT_SET_SQL). Bounded by LayoutCommand.MAX_SETS and run only on a verified-unclaimed
		// venue, so the per-row round-trips are acceptable for this rare operator action; if it ever
		// mattered, JdbcClient sits on NamedParameterJdbcTemplate.batchUpdate.
		for (SetCommand c : sets) {
			jdbc.sql(INSERT_SET_SQL).params(insertParams(venueId, c)).update();
		}
	}

	/** The full insert param map for a set: the shared set fields plus the owning venue id. */
	private static Map<String, Object> insertParams(VenueId venueId, SetCommand c) {
		Map<String, Object> params = new HashMap<>(setParams(c));
		params.put(P_VENUE, venueId.value());
		return params;
	}

	@Override
	public int updateVenueProfile(VenueId venueId, VenueProfileCommand command) {
		// The venue UPDATE's rows-affected is the existence check (0 ⇒ no such venue). Only when the
		// venue exists do we replace its amenity set (delete-then-insert). Both run inside the
		// service's @Transactional boundary, so the set is never left partially replaced.
		//
		// commission_bps and payout_currency are NOT in the SET clause — they are read-only for
		// operators (invariant #9 / provisional payout currency), and the command carries no such
		// field, so a crafted request cannot reach them (O8, issue #177).
		int rows = jdbc.sql("""
				UPDATE venue
				SET name = :name, beach = :beach, region = :region, description = :description,
				    booking_mode = :mode, booking_cutoff = :cutoff, distance_to_water_m = :distance
				WHERE id = :id
				""")
				.param("name", command.name())
				.param("beach", command.beach())
				.param("region", command.region())
				.param("description", command.description())
				.param("mode", command.bookingMode())
				.param("cutoff", command.bookingCutoff())
				.param("distance", command.distanceToWaterM())
				.param("id", venueId.value())
				.update();
		if (rows == 0) {
			return 0;
		}
		jdbc.sql("DELETE FROM venue_amenity WHERE venue_id = :id")
				.param("id", venueId.value())
				.update();
		for (Amenity amenity : command.amenities()) {
			jdbc.sql("INSERT INTO venue_amenity (venue_id, amenity) VALUES (:id, :amenity)")
					.param("id", venueId.value())
					.param("amenity", amenity.name())
					.update();
		}
		return rows;
	}

	@Override
	public Optional<VenueProfileView> findProfile(VenueId venueId) {
		// The owner's admin profile (O8 #177): the editable core + the read-only commission + payout
		// currency. Two reads inside the caller's read-only tx — the venue row, then its amenity set
		// (catalogue-ordered) — mirroring findVenueMap's shape. Ownership is asserted by the caller.
		Optional<ProfileRow> venue = jdbc.sql("""
				SELECT name, beach, region, description, booking_mode, booking_cutoff,
				       commission_bps, payout_currency, distance_to_water_m
				FROM venue
				WHERE id = :id
				""")
				.param("id", venueId.value())
				.query((rs, rowNum) -> new ProfileRow(
						rs.getString("name"), rs.getString("beach"), rs.getString("region"),
						rs.getString("description"),
						BookingMode.valueOf(rs.getString("booking_mode")),
						rs.getObject("booking_cutoff", LocalTime.class),
						rs.getInt("commission_bps"), rs.getString("payout_currency"),
						rs.getObject("distance_to_water_m", Integer.class)))
				.optional();
		if (venue.isEmpty()) {
			return Optional.empty();
		}
		ProfileRow v = venue.get();
		List<Amenity> amenities = jdbc.sql("SELECT amenity FROM venue_amenity WHERE venue_id = :id")
				.param("id", venueId.value())
				.query((rs, rowNum) -> Amenity.valueOf(rs.getString("amenity")))
				.list().stream()
				.sorted() // enum natural order == canonical catalogue order (as findVenueMap)
				.toList();
		return Optional.of(new VenueProfileView(v.name(), v.beach(), v.region(), v.description(),
				v.bookingMode(), v.bookingCutoff(), v.commissionBps(), v.payoutCurrency(),
				amenities, v.distanceToWaterM()));
	}

	/** The venue row backing a {@link VenueProfileView}, before its amenity set is folded in. */
	private record ProfileRow(String name, String beach, String region, String description,
			BookingMode bookingMode, LocalTime bookingCutoff, int commissionBps, String payoutCurrency,
			Integer distanceToWaterM) {
	}

	private static Map<String, Object> setParams(SetCommand c) {
		return Map.of(
				P_ROW_LABEL, c.rowLabel(), "positionNo", c.positionNo(), "tier", c.tier(),
				"pool", c.pool(), "priceMinor", c.priceMinor(), "priceCurrency", c.priceCurrency(),
				"gridX", c.gridX(), "gridY", c.gridY());
	}

	private record ConflictRow(boolean positionTaken, boolean cellTaken) {
	}
}
