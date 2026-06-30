package ai.riviera.platform.venue.infrastructure.out;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.application.in.NewVenueCommand;
import ai.riviera.platform.venue.application.in.SetCommand;
import ai.riviera.platform.venue.application.out.Venues;

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
				.param("rowLabel", c.rowLabel())
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
		Map<String, Object> params = new HashMap<>(setParams(c));
		params.put(P_VENUE, venueId.value());
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:venue, :rowLabel, :positionNo, :tier, :pool,
				        :priceMinor, :priceCurrency, :gridX, :gridY)
				RETURNING id
				""")
				.params(params)
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

	private static Map<String, Object> setParams(SetCommand c) {
		return Map.of(
				"rowLabel", c.rowLabel(), "positionNo", c.positionNo(), "tier", c.tier(),
				"pool", c.pool(), "priceMinor", c.priceMinor(), "priceCurrency", c.priceCurrency(),
				"gridX", c.gridX(), "gridY", c.gridY());
	}

	private record ConflictRow(boolean positionTaken, boolean cellTaken) {
	}
}
