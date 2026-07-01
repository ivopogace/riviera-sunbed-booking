package ai.riviera.platform.venue.adapter.out;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.vocabulary.AvailabilitySummary;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;

/**
 * JDBC adapter implementing the three role-split {@code venue::api} read ports —
 * {@link VenueCatalog}, {@link SetBookingFacts}, {@link VenueRates} — directly (no
 * intervening application service / out-port — a single adapter is a hypothetical seam,
 * not a real one). One bean, three narrow surfaces (issue #94). Explicit SQL via
 * {@link JdbcClient}, no JPA (invariant #1): one query loads the venue, a second
 * loads its sets ordered for rendering, and from-price is the minimum set price.
 */
@Repository
class JdbcVenueCatalog implements VenueCatalog, SetBookingFacts, VenueRates {

	private static final String AVAILABILITY_FREE = "FREE";
	private static final String AVAILABILITY_TAKEN = "TAKEN";

	// Column / bind-parameter names shared across the read queries below (named so the same SQL
	// identifier is written once — invariant-style "name your literals", and silences Sonar S1192).
	private static final String COL_BEACH = "beach";
	private static final String COL_REGION = "region";
	private static final String COL_PRICE_MINOR = "price_minor";
	private static final String COL_PRICE_CURRENCY = "price_currency";

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
						rs.getLong("id"), rs.getString("name"), rs.getString(COL_BEACH),
						rs.getString(COL_REGION), rs.getString("description"),
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
						new MoneyView(rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)),
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
	public List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date) {
		// Optional filters: a null dimension drops its predicate. CAST(:p AS TEXT) lets Postgres
		// type the bound NULL so "(:p IS NULL OR col = :p)" plans without an undetermined-type error.
		List<SummaryRow> venues = jdbc.sql("""
				SELECT id, name, beach, region, rating_tenths, reviews_count, booking_mode
				FROM venue
				WHERE (CAST(:beach AS TEXT) IS NULL OR beach = :beach)
				  AND (CAST(:region AS TEXT) IS NULL OR region = :region)
				ORDER BY rating_tenths DESC, name ASC
				""")
				.param(COL_BEACH, filter.beach())
				.param(COL_REGION, filter.region())
				.query((rs, rowNum) -> new SummaryRow(
						rs.getLong("id"), rs.getString("name"), rs.getString(COL_BEACH),
						rs.getString(COL_REGION), rs.getInt("rating_tenths"),
						rs.getInt("reviews_count"), rs.getString("booking_mode")))
				.list();

		if (venues.isEmpty()) {
			return List.of();
		}

		// Load every matched venue's sets in one query, then bucket in memory — one round-trip,
		// no per-venue N+1. A LEFT-join shape in Java: a venue with no sets simply gets an empty list.
		List<Long> venueIds = venues.stream().map(SummaryRow::id).toList();
		List<SetPriceRow> sets = jdbc.sql("""
				SELECT id, venue_id, price_minor, price_currency
				FROM set_position
				WHERE venue_id IN (:venueIds)
				""")
				.param("venueIds", venueIds)
				.query((rs, rowNum) -> new SetPriceRow(
						rs.getLong("id"), rs.getLong("venue_id"),
						rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)))
				.list();

		// One availability read for ALL sets across all matched venues (reuses the U2 source of
		// truth via the spi — invariant #2), then free = total − taken per venue.
		Set<SetId> taken = availability.takenOn(
				sets.stream().map(s -> new SetId(s.id())).toList(), date);
		Map<Long, List<SetPriceRow>> setsByVenue = sets.stream()
				.collect(Collectors.groupingBy(SetPriceRow::venueId));

		return venues.stream()
				.map(v -> toSummary(v, setsByVenue.getOrDefault(v.id(), List.of()), taken))
				.toList();
	}

	private static VenueSummaryView toSummary(SummaryRow v, List<SetPriceRow> sets, Set<SetId> taken) {
		int total = sets.size();
		int free = (int) sets.stream().filter(s -> !taken.contains(new SetId(s.id()))).count();
		MoneyView fromPrice = sets.stream()
				.min(Comparator.comparingLong(SetPriceRow::priceMinor))
				.map(s -> new MoneyView(s.priceMinor(), s.priceCurrency()))
				.orElse(null);
		return new VenueSummaryView(v.id(), v.name(), v.beach(), v.region(),
				v.ratingTenths(), v.reviewsCount(), v.bookingMode(),
				fromPrice, new AvailabilitySummary(free, total));
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
	public OptionalInt lateCancelRefundBps(VenueId id) {
		return jdbc.sql("SELECT late_cancel_refund_bps FROM venue WHERE id = :id")
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
						new MoneyView(rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)),
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

	/** A venue's discovery-list row, before its sets' price/availability are folded in. */
	private record SummaryRow(long id, String name, String beach, String region,
			int ratingTenths, int reviewsCount, String bookingMode) {
	}

	/** A set's id, owning venue, and price — all the list view needs to count and price a venue. */
	private record SetPriceRow(long id, long venueId, long priceMinor, String priceCurrency) {
	}
}
