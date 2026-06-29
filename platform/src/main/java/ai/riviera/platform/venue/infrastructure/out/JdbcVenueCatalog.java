package ai.riviera.platform.venue.infrastructure.out;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.SetView;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;

/**
 * JDBC adapter implementing {@link VenueCatalog} directly (no intervening application
 * service / out-port — a single adapter is a hypothetical seam, not a real one). Explicit
 * SQL via {@link JdbcClient}, no JPA (invariant #1): one query loads the venue, a second
 * loads its sets ordered for rendering, and from-price is the minimum set price.
 */
@Repository
class JdbcVenueCatalog implements VenueCatalog {

	private static final String AVAILABILITY_FREE = "FREE";
	private static final String AVAILABILITY_TAKEN = "TAKEN";

	private final JdbcClient jdbc;
	private final SetAvailabilityLookup availability;

	JdbcVenueCatalog(JdbcClient jdbc, SetAvailabilityLookup availability) {
		this.jdbc = jdbc;
		this.availability = availability;
	}

	@Override
	public Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date) {
		Optional<VenueRow> venue = jdbc.sql("""
				SELECT id, name, beach, region, description, rating_tenths, reviews_count, booking_mode
				FROM venue
				WHERE id = :id
				""")
				.param("id", id.value())
				.query((rs, rowNum) -> new VenueRow(
						rs.getLong("id"), rs.getString("name"), rs.getString("beach"),
						rs.getString("region"), rs.getString("description"),
						rs.getInt("rating_tenths"), rs.getInt("reviews_count"),
						rs.getString("booking_mode")))
				.optional();

		if (venue.isEmpty()) {
			return Optional.empty();
		}
		VenueRow v = venue.get();

		// The static layout (venue's own table) — availability is NOT read here; it is the one
		// fact venue lacks and overlays from the source of truth below (issue #44, invariant #2).
		List<SetRow> rows = jdbc.sql("""
				SELECT id, row_label, position_no, tier, pool, price_minor, price_currency,
				       grid_x, grid_y
				FROM set_position
				WHERE venue_id = :id
				ORDER BY grid_y, grid_x
				""")
				.param("id", id.value())
				.query((rs, rowNum) -> new SetRow(
						rs.getLong("id"), rs.getString("row_label"), rs.getInt("position_no"),
						rs.getString("tier"), rs.getString("pool"),
						new MoneyView(rs.getLong("price_minor"), rs.getString("price_currency")),
						rs.getInt("grid_x"), rs.getInt("grid_y")))
				.list();

		Set<SetId> taken = availability.takenOn(rows.stream().map(r -> new SetId(r.id())).toList(), date);

		List<SetView> sets = rows.stream()
				.map(r -> new SetView(r.id(), r.rowLabel(), r.positionNo(), r.tier(), r.pool(),
						r.price(), r.gridX(), r.gridY(),
						taken.contains(new SetId(r.id())) ? AVAILABILITY_TAKEN : AVAILABILITY_FREE))
				.toList();

		MoneyView fromPrice = sets.stream()
				.map(SetView::price)
				.min(Comparator.comparingLong(MoneyView::minorUnits))
				.orElse(null);

		return Optional.of(new VenueMapView(v.id(), v.name(), v.beach(), v.region(),
				v.description(), v.ratingTenths(), v.reviewsCount(), v.bookingMode(),
				fromPrice, sets));
	}

	@Override
	public OptionalInt commissionBps(VenueId id) {
		return jdbc.sql("SELECT commission_bps FROM venue WHERE id = :id")
				.param("id", id.value())
				.query(Integer.class)
				.optional()
				.map(OptionalInt::of)
				.orElseGet(OptionalInt::empty);
	}

	@Override
	public Optional<String> poolOf(SetId setId) {
		return jdbc.sql("SELECT pool FROM set_position WHERE id = :id")
				.param("id", setId.value())
				.query(String.class)
				.optional();
	}

	@Override
	public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
		return jdbc.sql("""
				SELECT sp.id AS set_id, sp.venue_id, v.name AS venue_name, sp.row_label,
				       sp.position_no, sp.pool, sp.price_minor, sp.price_currency, v.booking_cutoff
				FROM set_position sp
				JOIN venue v ON v.id = sp.venue_id
				WHERE sp.id = :id
				""")
				.param("id", setId.value())
				.query((rs, rowNum) -> new SetBookingInfo(
						new SetId(rs.getLong("set_id")), new VenueId(rs.getLong("venue_id")),
						rs.getString("venue_name"), rs.getString("row_label"),
						rs.getInt("position_no"), rs.getString("pool"),
						new MoneyView(rs.getLong("price_minor"), rs.getString("price_currency")),
						rs.getObject("booking_cutoff", java.time.LocalTime.class)))
				.optional();
	}

	private record VenueRow(long id, String name, String beach, String region,
			String description, int ratingTenths, int reviewsCount, String bookingMode) {
	}

	/** The static set-position layout, before availability is overlaid for the chosen date. */
	private record SetRow(long id, String rowLabel, int positionNo, String tier, String pool,
			MoneyView price, int gridX, int gridY) {
	}
}
