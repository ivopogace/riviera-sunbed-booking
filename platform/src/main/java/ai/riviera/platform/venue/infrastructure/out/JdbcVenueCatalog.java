package ai.riviera.platform.venue.infrastructure.out;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetView;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;

/**
 * JDBC adapter implementing {@link VenueCatalog} directly (no intervening application
 * service / out-port — a single adapter is a hypothetical seam, not a real one). Explicit
 * SQL via {@link JdbcClient}, no JPA (invariant #1): one query loads the venue, a second
 * loads its sets ordered for rendering, and from-price is the minimum set price.
 */
@Repository
class JdbcVenueCatalog implements VenueCatalog {

	private final JdbcClient jdbc;

	JdbcVenueCatalog(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<VenueMapView> findVenueMap(VenueId id) {
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

		List<SetView> sets = jdbc.sql("""
				SELECT id, row_label, position_no, tier, pool, price_minor, price_currency,
				       grid_x, grid_y, seed_availability
				FROM set_position
				WHERE venue_id = :id
				ORDER BY grid_y, grid_x
				""")
				.param("id", id.value())
				.query((rs, rowNum) -> new SetView(
						rs.getLong("id"), rs.getString("row_label"), rs.getInt("position_no"),
						rs.getString("tier"), rs.getString("pool"),
						new MoneyView(rs.getLong("price_minor"), rs.getString("price_currency")),
						rs.getInt("grid_x"), rs.getInt("grid_y"), rs.getString("seed_availability")))
				.list();

		MoneyView fromPrice = sets.stream()
				.map(SetView::price)
				.min(Comparator.comparingLong(MoneyView::minorUnits))
				.orElse(null);

		return Optional.of(new VenueMapView(v.id(), v.name(), v.beach(), v.region(),
				v.description(), v.ratingTenths(), v.reviewsCount(), v.bookingMode(),
				fromPrice, sets));
	}

	private record VenueRow(long id, String name, String beach, String region,
			String description, int ratingTenths, int reviewsCount, String bookingMode) {
	}
}
