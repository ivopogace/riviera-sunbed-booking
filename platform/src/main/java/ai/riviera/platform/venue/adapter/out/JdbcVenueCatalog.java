package ai.riviera.platform.venue.adapter.out;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.venue.application.PhotoServingUrls;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.AvailabilitySummary;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.CoverPhotoView;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
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
 * not a real one). One bean, three narrow surfaces. Explicit SQL via
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
	private static final String COL_BOOKING_MODE = "booking_mode";
	private static final String COL_DISTANCE_TO_WATER = "distance_to_water_m";
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_AMENITY = "amenity";
	/** The bulk IN-clause bind param shared by the three list-read queries (named once — Sonar S1192). */
	private static final String P_VENUE_IDS = "venueIds";

	private final JdbcClient jdbc;
	private final SetAvailabilityLookup availability;

	JdbcVenueCatalog(JdbcClient jdbc, SetAvailabilityLookup availability) {
		this.jdbc = jdbc;
		this.availability = availability;
	}

	@Override
	public Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date) {
		Optional<VenueRow> venue = jdbc.sql("""
				SELECT id, name, beach, region, description, rating_tenths, reviews_count, booking_mode,
				       distance_to_water_m, set_version
				FROM venue
				WHERE id = :id
				""")
				.param("id", id.value())
				.query((rs, rowNum) -> new VenueRow(
						rs.getLong("id"), rs.getString("name"), rs.getString(COL_BEACH),
						rs.getString(COL_REGION), rs.getString("description"),
						rs.getInt("rating_tenths"), rs.getInt("reviews_count"),
						rs.getString(COL_BOOKING_MODE),
						rs.getObject(COL_DISTANCE_TO_WATER, Integer.class),
						rs.getLong("set_version")))
				.optional();

		if (venue.isEmpty()) {
			return Optional.empty();
		}
		VenueRow v = venue.get();

		// The static layout (venue's own table) — availability is NOT read here; it is the one
		// fact venue lacks and overlays from the source of truth below (invariant #2).
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

		List<Amenity> amenities = jdbc.sql("SELECT amenity FROM venue_amenity WHERE venue_id = :id")
				.param("id", id.value())
				.query((rs, rowNum) -> Amenity.valueOf(rs.getString(COL_AMENITY)))
				.list().stream()
				.sorted() // enum natural order == declaration order == canonical catalogue order
				.toList();

		CoverPhotoView coverPhoto = coverOf(id.value(),
				photoVariantsByVenue(List.of(id.value())).getOrDefault(id.value(), Map.of()));

		return Optional.of(new VenueMapView(v.id(), v.name(), v.beach(), v.region(),
				v.description(), v.ratingTenths(), v.reviewsCount(), v.bookingMode(),
				fromPrice, amenities, v.distanceToWaterM(), sets, v.setVersion(), coverPhoto));
	}

	@Override
	public List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date) {
		// Optional filters: a null dimension drops its predicate. CAST(:p AS TEXT) lets Postgres
		// type the bound NULL so "(:p IS NULL OR col = :p)" plans without an undetermined-type error.
		List<SummaryRow> venues = jdbc.sql("""
				SELECT id, name, beach, region, rating_tenths, reviews_count, booking_mode,
				       distance_to_water_m
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
						rs.getInt("reviews_count"), rs.getString(COL_BOOKING_MODE),
						rs.getObject(COL_DISTANCE_TO_WATER, Integer.class)))
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
				.param(P_VENUE_IDS, venueIds)
				.query((rs, rowNum) -> new SetPriceRow(
						rs.getLong("id"), rs.getLong(COL_VENUE_ID),
						rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)))
				.list();

		// One availability read for ALL sets across all matched venues (reuses the U2 source of
		// truth via the spi — invariant #2), then free = total − taken per venue.
		Set<SetId> taken = availability.takenOn(
				sets.stream().map(s -> new SetId(s.id())).toList(), date);
		Map<Long, List<SetPriceRow>> setsByVenue = sets.stream()
				.collect(Collectors.groupingBy(SetPriceRow::venueId));

		// One amenity read for ALL matched venues, bucketed by venue — no per-venue N+1. Each
		// bucket is catalogue-ordered in toSummary; a venue with none simply gets an empty list.
		Map<Long, List<Amenity>> amenitiesByVenue = jdbc.sql("""
				SELECT venue_id, amenity FROM venue_amenity WHERE venue_id IN (:venueIds)
				""")
				.param(P_VENUE_IDS, venueIds)
				.query((rs, rowNum) -> new AmenityRow(
						rs.getLong(COL_VENUE_ID), Amenity.valueOf(rs.getString(COL_AMENITY))))
				.list().stream()
				.collect(Collectors.groupingBy(AmenityRow::venueId,
						Collectors.mapping(AmenityRow::amenity, Collectors.toList())));

		// One blob-free photo read for ALL matched venues feeds both the cover pair and the slideshow.
		Map<Long, Map<PhotoSlot, Map<PhotoSurface, String>>> photosByVenue = photoVariantsByVenue(venueIds);

		return venues.stream()
				.map(v -> toSummary(v, setsByVenue.getOrDefault(v.id(), List.of()), taken,
						amenitiesByVenue.getOrDefault(v.id(), List.of()),
						coverOf(v.id(), photosByVenue.getOrDefault(v.id(), Map.of())),
						slideshowOf(v.id(), photosByVenue.getOrDefault(v.id(), Map.of()))))
				.toList();
	}

	/**
	 * Every stored photo-variant hash for the venues, in one blob-free query (only hashes travel;
	 * the {@code bytea} column is never selected here — R-3/ADR-0008), bucketed
	 * venue → slot → surface with slots in {@link PhotoSlot} order. Both tourist photo views
	 * derive from this one read — {@link #coverOf} and {@link #slideshowOf} — so they cannot drift.
	 */
	private Map<Long, Map<PhotoSlot, Map<PhotoSurface, String>>> photoVariantsByVenue(List<Long> venueIds) {
		record VariantRow(long venueId, PhotoSlot slot, PhotoSurface surface, String hash) {
		}
		Map<Long, Map<PhotoSlot, Map<PhotoSurface, String>>> byVenue = new HashMap<>();
		jdbc.sql("""
				SELECT vp.venue_id, vp.slot, vv.surface, vv.content_hash
				FROM venue_photo vp
				JOIN venue_photo_variant vv ON vv.photo_id = vp.id
				WHERE vp.venue_id IN (:venueIds)
				""")
				.param(P_VENUE_IDS, venueIds)
				.query((rs, rowNum) -> new VariantRow(
						rs.getLong(COL_VENUE_ID), PhotoSlot.valueOf(rs.getString("slot")),
						PhotoSurface.valueOf(rs.getString("surface")), rs.getString("content_hash")))
				.list()
				.forEach(row -> byVenue
						.computeIfAbsent(row.venueId(), id -> new EnumMap<>(PhotoSlot.class))
						.computeIfAbsent(row.slot(), slot -> new EnumMap<>(PhotoSurface.class))
						.put(row.surface(), row.hash()));
		return byVenue;
	}

	/**
	 * The COVER slot's card + banner serving URLs, or {@code null} without a COMPLETE pair: a
	 * cover missing one of its CARD/BANNER rows (manual data fix, future surface-set change) must
	 * read as "no cover" — otherwise the frontend's presence check passes and
	 * {@code NgOptimizedImage} receives a null URL.
	 */
	private static CoverPhotoView coverOf(long venueId, Map<PhotoSlot, Map<PhotoSurface, String>> slots) {
		Map<PhotoSurface, String> cover = slots.getOrDefault(PhotoSlot.COVER, Map.of());
		String card = cover.get(PhotoSurface.CARD);
		String banner = cover.get(PhotoSurface.BANNER);
		if (card == null || banner == null) {
			return null;
		}
		return new CoverPhotoView(
				PhotoServingUrls.servingUrl(venueId, new ContentHash(card)),
				PhotoServingUrls.servingUrl(venueId, new ContentHash(banner)));
	}

	/**
	 * The Discover slideshow: one card-sized serving URL per occupied slot, in {@link PhotoSlot}
	 * order (the EnumMap's iteration order — cover, sunbeds, bar), preferring the CARD variant and
	 * falling back to PREVIEW for secondary-slot uploads predating their CARD variant.
	 */
	private static List<String> slideshowOf(long venueId, Map<PhotoSlot, Map<PhotoSurface, String>> slots) {
		List<String> photos = new ArrayList<>();
		slots.forEach((slot, surfaces) -> {
			String hash = surfaces.getOrDefault(PhotoSurface.CARD, surfaces.get(PhotoSurface.PREVIEW));
			if (hash != null) {
				photos.add(PhotoServingUrls.servingUrl(venueId, new ContentHash(hash)));
			}
		});
		return List.copyOf(photos);
	}

	private static VenueSummaryView toSummary(SummaryRow v, List<SetPriceRow> sets, Set<SetId> taken,
			List<Amenity> amenities, CoverPhotoView coverPhoto, List<String> photos) {
		int total = sets.size();
		int free = (int) sets.stream().filter(s -> !taken.contains(new SetId(s.id()))).count();
		MoneyView fromPrice = sets.stream()
				.min(Comparator.comparingLong(SetPriceRow::priceMinor))
				.map(s -> new MoneyView(s.priceMinor(), s.priceCurrency()))
				.orElse(null);
		List<Amenity> ordered = amenities.stream().sorted().toList(); // canonical catalogue order
		return new VenueSummaryView(v.id(), v.name(), v.beach(), v.region(),
				v.ratingTenths(), v.reviewsCount(), v.bookingMode(),
				fromPrice, ordered, v.distanceToWaterM(), new AvailabilitySummary(free, total),
				coverPhoto, photos);
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

	/**
	 * The latest scheduled rate at or before the service date, falling back to the live rate when the
	 * venue has no schedule at all — which means its rate has never changed, so the live rate IS what
	 * applied (A7, #348). Driven off the {@code venue} row rather than the schedule, so an unknown
	 * venue answers empty instead of a rate; the subquery rides the composite PK's leftmost prefix +
	 * range, so it needs no index of its own.
	 */
	@Override
	public OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate) {
		return jdbc.sql("""
				SELECT COALESCE(
				         (SELECT commission_bps
				            FROM venue_commission_rate
				           WHERE venue_id = v.id AND effective_from <= :serviceDate
				           ORDER BY effective_from DESC
				           LIMIT 1),
				         v.commission_bps) AS commission_bps
				  FROM venue v
				 WHERE v.id = :id
				""")
				.param("id", id.value())
				.param("serviceDate", serviceDate)
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
	public Optional<String> poolForClaim(SetId setId) {
		// FOR KEY SHARE: the lock the claim's own INSERT needs anyway, taken early (invariant #3).
		return jdbc.sql("SELECT pool FROM set_position WHERE id = :id FOR KEY SHARE")
				.param("id", setId.value())
				.query(String.class)
				.optional();
	}

	/** The set-facts row shared by the single-id and batch reads — one SQL shape, one mapper. */
	private static final String SET_BOOKING_INFO_SELECT = """
			SELECT sp.id AS set_id, sp.venue_id, v.name AS venue_name, sp.row_label,
			       sp.position_no, sp.pool, sp.price_minor, sp.price_currency, v.booking_cutoff,
			       v.booking_mode
			FROM set_position sp
			JOIN venue v ON v.id = sp.venue_id
			""";

	@Override
	public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
		return jdbc.sql(SET_BOOKING_INFO_SELECT + "WHERE sp.id = :id")
				.param("id", setId.value())
				.query(JdbcVenueCatalog::mapSetBookingInfo)
				.optional();
	}

	@Override
	public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
		if (setIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql(SET_BOOKING_INFO_SELECT + "WHERE sp.id IN (:setIds)")
				.param("setIds", setIds.stream().map(SetId::value).toList())
				.query(JdbcVenueCatalog::mapSetBookingInfo)
				.list().stream()
				.collect(Collectors.toMap(SetBookingInfo::setId, info -> info));
	}

	private static SetBookingInfo mapSetBookingInfo(java.sql.ResultSet rs, int rowNum)
			throws java.sql.SQLException {
		return new SetBookingInfo(
				new SetId(rs.getLong("set_id")), new VenueId(rs.getLong(COL_VENUE_ID)),
				rs.getString("venue_name"), rs.getString("row_label"),
				rs.getInt("position_no"), rs.getString("pool"),
				new MoneyView(rs.getLong(COL_PRICE_MINOR), rs.getString(COL_PRICE_CURRENCY)),
				rs.getObject("booking_cutoff", java.time.LocalTime.class),
				BookingMode.valueOf(rs.getString(COL_BOOKING_MODE)));
	}

	private record VenueRow(long id, String name, String beach, String region,
			String description, int ratingTenths, int reviewsCount, String bookingMode,
			Integer distanceToWaterM, long setVersion) {
	}

	/** The static set-position layout, before availability is overlaid for the chosen date. */
	private record SetRow(long id, String rowLabel, int positionNo, String tier, String pool,
			MoneyView price, int gridX, int gridY) {
	}

	/** A venue's discovery-list row, before its sets' price/availability are folded in. */
	private record SummaryRow(long id, String name, String beach, String region,
			int ratingTenths, int reviewsCount, String bookingMode, Integer distanceToWaterM) {
	}

	/** A set's id, owning venue, and price — all the list view needs to count and price a venue. */
	private record SetPriceRow(long id, long venueId, long priceMinor, String priceCurrency) {
	}

	/** One (venue, amenity) pair from the join table, bucketed by venue for the list read. */
	private record AmenityRow(long venueId, Amenity amenity) {
	}
}
