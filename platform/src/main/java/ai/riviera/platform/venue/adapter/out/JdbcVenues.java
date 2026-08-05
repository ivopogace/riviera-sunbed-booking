package ai.riviera.platform.venue.adapter.out;

import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalTime;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.CommissionRateStore;
import ai.riviera.platform.venue.application.NewVenueCommand;
import ai.riviera.platform.venue.application.OwnedVenueView;
import ai.riviera.platform.venue.application.PhotoServingUrls;
import ai.riviera.platform.venue.application.PhotoSlotView;
import ai.riviera.platform.venue.application.RowPriceCommand;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.VenueCommissionView;
import ai.riviera.platform.venue.application.VenueProfileCommand;
import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.application.Venues;

/**
 * JDBC adapter implementing the {@link Venues} write port and the {@link CommissionRateStore}
 * (invariant #1 — no JPA). Explicit text-block SQL via {@link JdbcClient} with named params;
 * package-private, so callers depend on the port, not this class (invariant #11). Inserts use
 * {@code RETURNING id} to surface the identity PK. Rating/reviews/refund-policy columns take their
 * DB defaults on insert (a new venue has none).
 *
 * <p>One adapter serves both ports because both write the {@code venue} row: the ports are split by
 * the conversation their callers are having (an owner editing their venue vs the platform setting a
 * commercial term), not by table, and {@link #updateLiveRate} and {@link #updateVenueProfile} write
 * columns of the same row.
 */
@Repository
class JdbcVenues implements Venues, CommissionRateStore {

	/** Named-parameter keys reused across the set queries (must match the {@code :name} SQL refs). */
	private static final String P_SET_ID = "setId";
	private static final String P_VENUE = "venue";
	private static final String P_ROW_LABEL = "rowLabel";
	/** Venue text-column / bind-param names, reused across insert / profile-update / profile-read
	 *  (named once — Sonar S1192; mirrors JdbcVenueCatalog's COL_* constants). */
	private static final String COL_NAME = "name";
	private static final String COL_BEACH = "beach";
	private static final String COL_REGION = "region";
	private static final String COL_DESCRIPTION = "description";
	/**
	 * The date a venue's first rate change pins its previous rate at (A7 #348). It predates the
	 * platform, so once a venue has changed rate every service date it could have sold on is covered,
	 * and the "latest rate at or before this date" read can never fall through to the live rate for a
	 * day already sold.
	 */
	private static final LocalDate EPOCH_FLOOR = LocalDate.of(1970, 1, 1);
	/** One mapper for the commission columns, shared by the list read and the write's RETURNING. */
	private static final RowMapper<VenueCommissionView> COMMISSION_ROW = (rs, rowNum) ->
			new VenueCommissionView(rs.getLong("id"), rs.getString(COL_NAME), rs.getString(COL_BEACH),
					rs.getInt("commission_bps"), rs.getString("payout_currency"));

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
				.param(COL_NAME, c.name())
				.param(COL_BEACH, c.beach())
				.param(COL_REGION, c.region())
				.param(COL_DESCRIPTION, c.description())
				.param("mode", c.bookingMode())
				.param("bps", c.commissionBps())
				.param("currency", c.payoutCurrency())
				.param("cutoff", c.bookingCutoff())
				.query(Long.class)
				.single();
	}

	/**
	 * Reads {@code commission_bps} from the venue row, so it must run <strong>before</strong>
	 * {@link #updateLiveRate} overwrites it. {@code DO NOTHING}, never {@code DO UPDATE}: the floor
	 * holds the oldest rate we know of and must never move.
	 */
	@Override
	public void ensureFloorRate(VenueId venueId) {
		jdbc.sql("""
				INSERT INTO venue_commission_rate (venue_id, effective_from, commission_bps)
				SELECT id, :floor, commission_bps FROM venue WHERE id = :id
				ON CONFLICT (venue_id, effective_from) DO NOTHING
				""")
				.param("floor", EPOCH_FLOOR)
				.param("id", venueId.value())
				.update();
	}

	@Override
	public void schedule(VenueId venueId, LocalDate effectiveFrom, int commissionBps) {
		jdbc.sql("""
				INSERT INTO venue_commission_rate (venue_id, effective_from, commission_bps)
				VALUES (:venue, :effectiveFrom, :bps)
				ON CONFLICT (venue_id, effective_from)
				DO UPDATE SET commission_bps = EXCLUDED.commission_bps, recorded_at = NOW()
				""")
				.param(P_VENUE, venueId.value())
				.param("effectiveFrom", effectiveFrom)
				.param("bps", commissionBps)
				.update();
	}

	/**
	 * {@code RETURNING} yields the rows-affected signal and the updated view in one statement, so the
	 * view cannot describe a row a concurrent writer changed between a write and a separate re-read.
	 */
	@Override
	public Optional<VenueCommissionView> updateLiveRate(VenueId venueId, int commissionBps) {
		return jdbc.sql("""
				UPDATE venue
				   SET commission_bps = :bps
				 WHERE id = :id
				RETURNING id, name, beach, commission_bps, payout_currency
				""")
				.param("bps", commissionBps)
				.param("id", venueId.value())
				.query(COMMISSION_ROW)
				.optional();
	}

	/**
	 * Platform-wide by design (ADMIN-gated caller): no ownership filter, no id set. {@code ORDER BY
	 * name, id} keeps the admin list stable across reads when two venues share a name.
	 */
	@Override
	public List<VenueCommissionView> findAll() {
		return jdbc.sql("""
				SELECT id, name, beach, commission_bps, payout_currency
				  FROM venue
				 ORDER BY name, id
				""")
				.query(COMMISSION_ROW)
				.list();
	}

	@Override
	public boolean venueExists(VenueId venueId) {
		return jdbc.sql("SELECT EXISTS(SELECT 1 FROM venue WHERE id = :id)")
				.param("id", venueId.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public long lockAndReadSetVersion(VenueId venueId) {
		// FOR UPDATE takes the venue row's write lock and reads the current set_version (#226). This is the
		// FIRST lock both set-writes acquire (before their set_position locks) → consistent venue→sets order
		// → no deadlock (R-1). The caller compares the value to the loaded expectedVersion (mismatch ⇒
		// STALE_WRITE) and advances it via incrementSetVersion ONLY on success — so a rejected write never
		// spuriously bumps the token. A concurrent writer blocks here until this tx ends, then re-reads the
		// (possibly incremented) value. Existence is pre-checked by the caller, so exactly one row.
		return jdbc.sql("SELECT set_version FROM venue WHERE id = :id FOR UPDATE")
				.param("id", venueId.value())
				.query(Long.class)
				.single();
	}

	@Override
	public void incrementSetVersion(VenueId venueId) {
		// Advance the token by one (#226) — called only after the set-write commits. The caller holds the
		// venue row lock from lockAndReadSetVersion, so this is race-free.
		jdbc.sql("UPDATE venue SET set_version = set_version + 1 WHERE id = :id")
				.param("id", venueId.value())
				.update();
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
	public List<SetId> setIdsOf(VenueId venueId) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :venue ORDER BY id")
				.param(P_VENUE, venueId.value())
				.query(Long.class)
				.list()
				.stream()
				.map(SetId::new)
				.toList();
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
	public int updateVenueProfile(VenueId venueId, long expectedVersion, VenueProfileCommand command) {
		// Conditional on the loaded version (#224): WHERE id = :id AND version = :version. The caller
		// has already verified the venue exists, so 0 rows-affected here means the version no longer
		// matches (a concurrent writer bumped it) — a stale write, and the amenity set below is left
		// untouched. On a match the row's version is bumped by one, so the other writer off the same
		// version loses. Only then do we replace the amenity set (delete-then-insert); both run inside
		// the service's @Transactional boundary, so the set is never left partially replaced.
		//
		// commission_bps and payout_currency are NOT in the SET clause — they are read-only for
		// operators (invariant #9 / provisional payout currency), and the command carries no such
		// field, so a crafted request cannot reach them (O8, issue #177).
		// The admin rate write is updateLiveRate — a separate statement, separate surface (A7 #348).
		int rows = jdbc.sql("""
				UPDATE venue
				SET name = :name, beach = :beach, region = :region, description = :description,
				    booking_mode = :mode, booking_cutoff = :cutoff, distance_to_water_m = :distance,
				    version = version + 1
				WHERE id = :id AND version = :version
				""")
				.param(COL_NAME, command.name())
				.param(COL_BEACH, command.beach())
				.param(COL_REGION, command.region())
				.param(COL_DESCRIPTION, command.description())
				.param("mode", command.bookingMode())
				.param("cutoff", command.bookingCutoff())
				.param("distance", command.distanceToWaterM())
				.param("id", venueId.value())
				.param("version", expectedVersion)
				.update();
		if (rows == 0) {
			return 0; // no version match (stale write) — amenity set untouched
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
	public List<OwnedVenueView> findSummaries(Collection<VenueId> ids) {
		// PK-set lookup on ids the caller already filtered; ORDER BY name, id keeps the picker stable.
		return jdbc.sql("""
				SELECT id, name, beach
				  FROM venue
				 WHERE id IN (:ids)
				 ORDER BY name, id
				""")
				.param("ids", ids.stream().map(VenueId::value).toList())
				.query((rs, rowNum) -> new OwnedVenueView(
						rs.getLong("id"), rs.getString(COL_NAME), rs.getString(COL_BEACH)))
				.list();
	}

	@Override
	public Optional<VenueProfileView> findProfile(VenueId venueId) {
		// The owner's admin profile (O8 #177): the editable core + the read-only commission + payout
		// currency. Two reads inside the caller's read-only tx — the venue row, then its amenity set
		// (catalogue-ordered) — mirroring findVenueMap's shape. Ownership is asserted by the caller.
		Optional<ProfileRow> venue = jdbc.sql("""
				SELECT name, beach, region, description, booking_mode, booking_cutoff,
				       commission_bps, payout_currency, distance_to_water_m, version
				FROM venue
				WHERE id = :id
				""")
				.param("id", venueId.value())
				.query((rs, rowNum) -> new ProfileRow(
						rs.getString(COL_NAME), rs.getString(COL_BEACH), rs.getString(COL_REGION),
						rs.getString(COL_DESCRIPTION),
						BookingMode.valueOf(rs.getString("booking_mode")),
						rs.getObject("booking_cutoff", LocalTime.class),
						rs.getInt("commission_bps"), rs.getString("payout_currency"),
						rs.getObject("distance_to_water_m", Integer.class),
						rs.getLong("version")))
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
				amenities, v.distanceToWaterM(), v.version(), slotPhotos(venueId)));
	}

	/**
	 * Every {@link PhotoSlot} in declaration order with its presence + PREVIEW serving URL (#142) —
	 * a stable three-slot grid for the console's Venue tab. Blob-free: only the hash travels; the
	 * {@code bytea} column is never selected outside the serving path (R-3, ADR-0008).
	 */
	private List<PhotoSlotView> slotPhotos(VenueId venueId) {
		record SlotPreviewRow(PhotoSlot slot, String hash) {
		}
		Map<PhotoSlot, String> previewBySlot = jdbc.sql("""
				SELECT vp.slot, vv.content_hash
				FROM venue_photo vp
				JOIN venue_photo_variant vv ON vv.photo_id = vp.id
				WHERE vp.venue_id = :id AND vv.surface = 'PREVIEW'
				""")
				.param("id", venueId.value())
				.query((rs, rowNum) -> new SlotPreviewRow(
						PhotoSlot.valueOf(rs.getString("slot")), rs.getString("content_hash")))
				.list().stream()
				.collect(Collectors.toMap(SlotPreviewRow::slot,
						r -> PhotoServingUrls.servingUrl(venueId.value(), new ContentHash(r.hash()))));
		return Arrays.stream(PhotoSlot.values())
				.map(slot -> new PhotoSlotView(slot, previewBySlot.get(slot)))
				.toList();
	}

	/** The venue row backing a {@link VenueProfileView}, before its amenity set is folded in. */
	private record ProfileRow(String name, String beach, String region, String description,
			BookingMode bookingMode, LocalTime bookingCutoff, int commissionBps, String payoutCurrency,
			Integer distanceToWaterM, long version) {
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
