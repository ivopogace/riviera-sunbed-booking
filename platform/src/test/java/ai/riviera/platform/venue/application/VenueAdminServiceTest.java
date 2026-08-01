package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.NewVenueCommand;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.Venues;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Branch coverage for the venue write orchestration (U7, issue #7) with an in-memory fake
 * {@link Venues} — no Spring, no DB. Proves the existence checks and conflict→{@link SetRejection}
 * mapping (AC-1/2/3/5) without paying Testcontainers startup; the round-trip and DB constraints
 * are pinned by {@code VenueAdminControllerIT} and {@code BeachMapLayoutMigrationIT}. The per-venue
 * ownership guard (issue #73) is stubbed by {@link FakeOwnership} — {@link #OWNER} owns
 * {@link #VENUE}, anyone else is denied; the end-to-end 403 path is pinned by {@code CrossVenueDenialIT}.
 */
class VenueAdminServiceTest {

	private static final VenueId VENUE = new VenueId(7);
	private static final SetId SET = new SetId(42);
	private static final OperatorId OWNER = new OperatorId(100);
	private static final OperatorId STRANGER = new OperatorId(200);
	private static final SetCommand SET_CMD =
			new SetCommand("Row A", 1, "PREMIUM", "ONLINE", 4500, "EUR", 2, 1);

	private final FakeVenues venues = new FakeVenues();
	private final FakeAvailability availability = new FakeAvailability();
	private final FakeBookings bookings = new FakeBookings();
	private final VenueAdminService service =
			new VenueAdminService(venues, new FakeOwnership(OWNER, VENUE), availability, bookings);

	private static LayoutCommand grid(int rows, int cols) {
		List<SetCommand> cells = new ArrayList<>();
		for (int y = 1; y <= rows; y++) {
			for (int x = 1; x <= cols; x++) {
				String tier = y == 1 ? "PREMIUM" : "STANDARD";
				cells.add(new SetCommand(String.valueOf((char) ('A' + y - 1)), x, tier, "ONLINE",
						2000, "EUR", x, y));
			}
		}
		return new LayoutCommand(cells);
	}

	@Test
	void onboardReturnsTheInsertedVenueId() {
		venues.nextVenueId = 99;
		NewVenueCommand command = new NewVenueCommand("Sunset", "Ksamil", "Riviera", "nice",
				"INSTANT", 1500, "EUR", LocalTime.of(18, 0));

		// Creator-owns-on-create writes ownership too (#115); the ownership write + non-owner denial is
		// proven end-to-end by CrossVenueDenialIT.creatorOwnsCreatedVenueAndOthersAreDenied.
		assertEquals(new VenueId(99), service.onboard(OWNER, command));
		assertEquals(1, venues.insertedVenues);
	}

	@Test
	void addSetToUnknownVenueIsRejectedAndNotInserted() {
		AddSetOutcome outcome = service.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetReturnsTheConflictAsRejection() {
		venues.venues.add(VENUE.value());
		venues.conflict = Optional.of(Venues.Conflict.CELL_TAKEN);

		AddSetOutcome outcome = service.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(SetRejection.CELL_TAKEN, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetInsertsAndReturnsTheNewId() {
		venues.venues.add(VENUE.value());
		venues.nextSetId = 123;

		AddSetOutcome outcome = service.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(new SetId(123), ((AddSetOutcome.Added) outcome).setId());
		assertEquals(1, venues.insertedSets);
	}

	@Test
	void editUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets);
	}

	@Test
	void editExistingSetAppliesTheUpdate() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, SET_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void removeUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		// removeSet relies on the DELETE's rows-affected (0 ⇒ no such set), so it attempts the
		// delete and maps the 0-row result to NO_SUCH_SET — no separate existence pre-check.
		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
	}

	@Test
	void editRejectsWhenTheSetVanishesBeforeTheUpdate() {
		// B2 race backstop: the set passes the existence check but is deleted concurrently before
		// the UPDATE, so updateSet touches 0 rows — the service must report NO_SUCH_SET, not success.
		venues.venues.add(VENUE.value());
		venues.forceSetExists = true; // pre-check passes
		venues.forceUpdateRows = 0; // ...but the UPDATE finds nothing

		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
	}

	@Test
	void removeExistingSetDeletesIt() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void addSetByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// The ownership guard runs first: a stranger is rejected before any existence check or insert.
		assertThrows(NotVenueOwnerException.class, () -> service.addSet(STRANGER, VENUE, SET_CMD));
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void editAndRemoveByANonOwnerAreDenied() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		assertThrows(NotVenueOwnerException.class, () -> service.editSet(STRANGER, VENUE, SET, SET_CMD));
		assertThrows(NotVenueOwnerException.class, () -> service.removeSet(STRANGER, VENUE, SET));
		assertEquals(0, venues.updatedSets);
		assertEquals(0, venues.deletedSets);
	}

	/** A valid widened profile command (O8 #177) with the given amenities + distance; core fields fixed. */
	private static VenueProfileCommand profile(Set<Amenity> amenities, Integer distanceToWaterM) {
		return new VenueProfileCommand("Sunset", "Ksamil", "Riviera", "nice", "INSTANT",
				LocalTime.of(18, 0), amenities, distanceToWaterM);
	}

	@Test
	void updateProfileWithCurrentVersionApplies() {
		// #224: the venue exists and the conditional UPDATE matches the loaded version ⇒ 1 row ⇒ APPLIED.
		venues.venues.add(VENUE.value());

		ProfileUpdateOutcome outcome = service.updateProfile(OWNER, VENUE, 0L,
				profile(Set.of(Amenity.BEACH_BAR, Amenity.WIFI), 20));

		assertEquals(ProfileUpdateOutcome.APPLIED, outcome);
		assertEquals(1, venues.updatedProfiles);
	}

	@Test
	void updateProfileWithStaleVersionIsStaleWrite() {
		// #224, AC-1: the venue exists but the conditional UPDATE finds no row at the loaded version
		// (another writer bumped it) ⇒ 0 rows ⇒ STALE_WRITE, and no profile column is reported changed.
		venues.venues.add(VENUE.value());
		venues.forceProfileUpdateRows = 0; // version no longer matches

		ProfileUpdateOutcome outcome = service.updateProfile(OWNER, VENUE, 0L,
				profile(Set.of(Amenity.BEACH_BAR), 20));

		assertEquals(ProfileUpdateOutcome.STALE_WRITE, outcome);
	}

	@Test
	void updateProfileOnUnknownVenueIsNoSuchVenue() {
		// Owner passes the ownership guard, but the venue does not exist ⇒ NO_SUCH_VENUE, and the
		// conditional UPDATE is never attempted (existence is checked first, so 0 rows is unambiguously stale).
		ProfileUpdateOutcome outcome = service.updateProfile(OWNER, VENUE, 0L, profile(Set.of(), null));

		assertEquals(ProfileUpdateOutcome.NO_SUCH_VENUE, outcome);
		assertEquals(0, venues.updatedProfiles);
	}

	@Test
	void profileEditByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// The ownership guard runs first: a stranger is rejected before any profile write (invariant #13).
		assertThrows(NotVenueOwnerException.class,
				() -> service.updateProfile(STRANGER, VENUE, 0L, profile(Set.of(Amenity.CAFE), 10)));
		assertEquals(0, venues.updatedProfiles);
	}

	// ---- Owner-asserted profile READ (O8, issue #177) ----

	@Test
	void profileForByOwnerReturnsTheView() {
		venues.venues.add(VENUE.value());

		VenueProfileView view = service.profileFor(OWNER, VENUE).orElseThrow();

		assertEquals("Sunset", view.name());
		assertEquals(1500, view.commissionBps()); // read-only display field is present in the view
	}

	@Test
	void profileForByNonOwnerIsDeniedBeforeAnyRead() {
		venues.venues.add(VENUE.value());

		// Invariant #13: an operator cannot read another operator's venue profile (commission is sensitive).
		assertThrows(NotVenueOwnerException.class, () -> service.profileFor(STRANGER, VENUE));
	}

	@Test
	void profileForUnknownVenueIsEmpty() {
		// Owner passes the (fake) ownership guard, but the venue does not exist ⇒ empty ⇒ controller 404.
		assertTrue(service.profileFor(OWNER, VENUE).isEmpty());
	}

	// ---- Bulk layout replace (O3, issue #172) ----

	@Test
	void replacesLayoutForUnclaimedVenue() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(1, venues.deletedAllCount);
		assertEquals(6, venues.insertedInLayout);
		assertEquals(1, venues.incrementedSetVersions); // #226: token advanced exactly once, on success
	}

	@Test
	void rejectsReplaceWhenVenueHasBooking() {
		venues.venues.add(VENUE.value());
		bookings.hasBookings = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount); // guard runs BEFORE any delete
		assertEquals(0, venues.insertedInLayout);
		// #226 review fix: a LAYOUT_IN_USE reject must NOT advance the token (no spurious bump), so the
		// acting operator's own retry after the lock clears still works off the same loaded token.
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void rejectsReplaceWhenVenueHasAvailabilityHold() {
		venues.venues.add(VENUE.value());
		availability.claimed = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
		assertEquals(0, venues.incrementedSetVersions); // no spurious bump on the in-use reject
	}

	@Test
	void rejectsEmptyLayout() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, new LayoutCommand(List.of()));

		assertEquals(ReplaceRejection.EMPTY_LAYOUT, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
	}

	@Test
	void rejectsDuplicateCellWithinTheBatch() {
		venues.venues.add(VENUE.value());
		LayoutCommand clashing = new LayoutCommand(List.of(
				new SetCommand("A", 1, "PREMIUM", "ONLINE", 2000, "EUR", 1, 1),
				new SetCommand("B", 2, "STANDARD", "ONLINE", 2000, "EUR", 1, 1))); // same grid cell

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, clashing);

		assertEquals(ReplaceRejection.CELL_TAKEN, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
	}

	@Test
	void rejectsReplaceOnUnknownVenue() {
		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(1, 1));

		assertEquals(ReplaceRejection.NO_SUCH_VENUE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
	}

	@Test
	void replaceWithStaleSetVersionIsStaleWrite() {
		// #226, AC-1 (unit): the venue exists but the locked set_version no longer matches the loaded token
		// (another writer advanced it) ⇒ STALE_WRITE, and the layout is left untouched — the version check
		// precedes the delete, and the token is never advanced on the stale path.
		venues.venues.add(VENUE.value());
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.STALE_WRITE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
		assertEquals(0, venues.insertedInLayout);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void replaceByANonOwnerIsDeniedBeforeAnyRead() {
		venues.venues.add(VENUE.value());

		assertThrows(NotVenueOwnerException.class,
				() -> service.replaceLayout(STRANGER, VENUE, 0L, grid(2, 3)));
		// Fail closed: the ownership guard fires before the claim probes, the version read/write, any delete.
		assertEquals(0, availability.anyClaimsCalls);
		assertEquals(0, venues.incrementedSetVersions);
		assertEquals(0, venues.deletedAllCount);
	}

	// ---- Per-row reprice (O4, issue #174) ----

	private static final RowPriceCommand REPRICE_CMD = new RowPriceCommand("A", 4200, "EUR");

	@Test
	void repricesRowForOwnedVenue() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.repricedRows);
		assertEquals(1, venues.incrementedSetVersions); // #226: token advanced once, on success
	}

	@Test
	void repriceOnUnknownVenueIsRejectedBeforeAnyWrite() {
		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.repricedRows);
	}

	@Test
	void repriceOfARowWithNoSetsIsNotFound() {
		// The venue exists but no set carries the row label ⇒ the UPDATE touches 0 rows ⇒ NO_SUCH_ROW.
		venues.venues.add(VENUE.value());
		venues.forceRepriceRows = 0;

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
		// #226 review fix: a NO_SUCH_ROW reject must NOT advance the token (no spurious bump), so the
		// acting operator's own next edit of a real row off the same loaded token still works.
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void repriceWithStaleSetVersionIsStaleWrite() {
		// #226, AC-2 (unit): the venue exists but the locked set_version no longer matches the loaded token
		// (another writer advanced it) ⇒ STALE_WRITE, the reprice UPDATE is never attempted, and the token
		// is not advanced.
		venues.venues.add(VENUE.value());
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.STALE_WRITE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.repricedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void repriceByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// Invariant #13: the ownership guard is the first act — a stranger is denied before the UPDATE.
		assertThrows(NotVenueOwnerException.class,
				() -> service.repriceRow(STRANGER, VENUE, 0L, REPRICE_CMD));
		assertEquals(0, venues.repricedRows);
		assertEquals(0, venues.incrementedSetVersions); // fail closed before the version read/write too (#226)
	}

	// ---- Owned-venues read (S9, issue #277) ----

	private static final OperatorId MULTI_OWNER = new OperatorId(7);
	private static final OperatorId OTHER_OWNER = new OperatorId(8);

	@Test
	void ownedByReturnsOnlyTheOperatorsOwnVenues() {
		// AC-1: "Aurora" (P's) sorts BEFORE both of O's, so a leak would land first and fail the assert.
		FakeVenues store = new FakeVenues();
		store.summaries.put(12L, new OwnedVenueView(12, "Miramar Beach Club", "Dhërmi"));
		store.summaries.put(15L, new OwnedVenueView(15, "Sereno", "Jal"));
		store.summaries.put(20L, new OwnedVenueView(20, "Aurora", "Borsh"));
		VenueAdminService owned = new VenueAdminService(store, new MultiOwnership(Map.of(
				MULTI_OWNER, Set.of(new VenueRef(12), new VenueRef(15)),
				OTHER_OWNER, Set.of(new VenueRef(20)))), availability, bookings);

		List<OwnedVenueView> result = owned.ownedBy(MULTI_OWNER);

		assertEquals(List.of(12L, 15L), result.stream().map(OwnedVenueView::id).toList());
		assertEquals(List.of("Miramar Beach Club", "Sereno"),
				result.stream().map(OwnedVenueView::name).toList());
		// AC-2: the store is never even asked about a venue this operator doesn't own (invariant #13).
		assertEquals(List.of(Set.of(new VenueId(12), new VenueId(15))),
				store.summaryQueries.stream().map(Set::copyOf).toList());
	}

	@Test
	void ownedByReturnsEmptyWithoutHittingTheRepositoryWhenNothingIsOwned() {
		// A freshly-approved operator owns nothing: an empty list, and no `IN ()` predicate at all.
		FakeVenues store = new FakeVenues();
		VenueAdminService owned =
				new VenueAdminService(store, new MultiOwnership(Map.of()), availability, bookings);

		assertEquals(List.of(), owned.ownedBy(MULTI_OWNER));
		assertEquals(List.of(), store.summaryQueries);
	}

	/** Stub {@link VenueOwnership} over an explicit operator→venues map (the S9 owned-venues read). */
	private record MultiOwnership(Map<OperatorId, Set<VenueRef>> byOperator) implements VenueOwnership {
		@Override
		public void assertOwns(OperatorId operator, VenueRef target) {
			if (!ownedVenues(operator).contains(target)) {
				throw new NotVenueOwnerException(operator, target);
			}
		}

		@Override
		public Set<VenueRef> ownedVenues(OperatorId operator) {
			return byOperator.getOrDefault(operator, Set.of());
		}

		@Override
		public void assignOwner(OperatorId operator, VenueRef target) {
			// not exercised by the owned-venues read
		}
	}

	/**
	 * Stub {@link VenueOwnership}: one operator owns one venue; {@code assertOwns} throws for anyone
	 * else. {@code ownedVenues} is unused here.
	 */
	private record FakeOwnership(OperatorId owner, VenueId venue) implements VenueOwnership {
		@Override
		public void assertOwns(OperatorId operator, VenueRef target) {
			if (!operator.equals(owner) || target.value() != venue.value()) {
				throw new NotVenueOwnerException(operator, target);
			}
		}

		@Override
		public Set<VenueRef> ownedVenues(OperatorId operator) {
			return operator.equals(owner) ? Set.of(new VenueRef(venue.value())) : Set.of();
		}

		@Override
		public void assignOwner(OperatorId operator, VenueRef target) {
			// creator-owns-on-create is wired in phase 1; verified end-to-end by CrossVenueDenialIT
		}
	}

	/** Programmable in-memory {@link Venues}: seed {@code venues}/{@code sets}/{@code conflict}. */
	private static final class FakeVenues implements Venues {
		final Set<Long> venues = new HashSet<>();
		final Map<Long, Long> sets = new HashMap<>(); // setId -> venueId
		Optional<Venues.Conflict> conflict = Optional.empty();
		long nextVenueId = 1;
		long nextSetId = 1;
		int insertedVenues;
		int insertedSets;
		int updatedSets;
		int deletedSets;
		int updatedProfiles;
		// Overrides to decouple the existence check from the write's rows-affected (race tests);
		// null ⇒ derive from the seeded `sets` map.
		Boolean forceSetExists;
		Integer forceUpdateRows;
		// #224: null ⇒ the profile UPDATE matches the loaded version (1 row, APPLIED); set 0 to model a
		// stale version (another writer bumped it since the load ⇒ STALE_WRITE).
		Integer forceProfileUpdateRows;

		@Override
		public long insertVenue(NewVenueCommand command) {
			insertedVenues++;
			return nextVenueId;
		}

		@Override
		public boolean venueExists(VenueId venueId) {
			return venues.contains(venueId.value());
		}

		int incrementedSetVersions;
		// #226: what lockAndReadSetVersion returns. The set-write tests pass expectedVersion 0, so the
		// default 0 models a token match (proceed); set it to a different value to model a stale token
		// (another replace/reprice advanced it since the load ⇒ STALE_WRITE).
		long setVersionOnLock;

		@Override
		public long lockAndReadSetVersion(VenueId venueId) {
			return setVersionOnLock;
		}

		@Override
		public void incrementSetVersion(VenueId venueId) {
			// Counted so a test can assert the token is advanced ONLY on the success path — never on a
			// STALE_WRITE / LAYOUT_IN_USE / NO_SUCH_ROW reject (no spurious bump).
			incrementedSetVersions++;
		}

		@Override
		public boolean setExists(VenueId venueId, SetId setId) {
			return forceSetExists != null
					? forceSetExists
					: venueId.value() == sets.getOrDefault(setId.value(), -1L);
		}

		@Override
		public Optional<Conflict> findConflict(VenueId venueId, SetCommand command, Optional<SetId> exclude) {
			return conflict;
		}

		@Override
		public long insertSet(VenueId venueId, SetCommand command) {
			insertedSets++;
			return nextSetId;
		}

		@Override
		public int updateSet(VenueId venueId, SetId setId, SetCommand command) {
			updatedSets++;
			return forceUpdateRows != null ? forceUpdateRows : (sets.containsKey(setId.value()) ? 1 : 0);
		}

		@Override
		public int deleteSet(VenueId venueId, SetId setId) {
			deletedSets++;
			return sets.containsKey(setId.value()) ? 1 : 0;
		}

		@Override
		public int updateVenueProfile(VenueId venueId, long expectedVersion, VenueProfileCommand command) {
			updatedProfiles++;
			// The service checks venueExists first, so this is only reached for an existing venue; the
			// default 1 models a version match. forceProfileUpdateRows = 0 models a stale-version loss.
			return forceProfileUpdateRows != null ? forceProfileUpdateRows : 1;
		}

		@Override
		public Optional<VenueProfileView> findProfile(VenueId venueId) {
			return venues.contains(venueId.value())
					? Optional.of(new VenueProfileView("Sunset", "Ksamil", "Riviera", "nice",
							BookingMode.INSTANT, LocalTime.of(18, 0), 1500, "EUR",
							List.of(Amenity.WIFI), 20, 0, List.of()))
					: Optional.empty();
		}

		final List<Long> existingSetIds = new ArrayList<>();
		int deletedAllCount;
		int insertedInLayout;

		@Override
		public List<SetId> lockSetsOfVenue(VenueId venueId) {
			return existingSetIds.stream().map(SetId::new).toList();
		}

		@Override
		public int deleteAllSets(VenueId venueId) {
			deletedAllCount++;
			int n = existingSetIds.size();
			existingSetIds.clear();
			return n;
		}

		@Override
		public void insertSets(VenueId venueId, List<SetCommand> sets) {
			insertedInLayout += sets.size();
		}

		// S9 (#277): seeded summaries, plus every id set asked for (so a test can assert what was NOT).
		final Map<Long, OwnedVenueView> summaries = new HashMap<>();
		final List<Collection<VenueId>> summaryQueries = new ArrayList<>();

		@Override
		public List<OwnedVenueView> findSummaries(Collection<VenueId> ids) {
			summaryQueries.add(List.copyOf(ids));
			// Models the port's contract: only the requested ids, ordered by name (the adapter's ORDER BY).
			return ids.stream()
					.map(id -> summaries.get(id.value()))
					.filter(Objects::nonNull)
					.sorted(Comparator.comparing(OwnedVenueView::name))
					.toList();
		}

		int repricedRows;
		// null ⇒ a row edit finds its sets (1 row updated); set to 0 to model an unknown row label.
		Integer forceRepriceRows;

		@Override
		public int repriceRow(VenueId venueId, RowPriceCommand command) {
			repricedRows++;
			return forceRepriceRows != null ? forceRepriceRows : 1;
		}
	}

	/** Programmable {@link SetAvailabilityLookup}: {@code claimed} drives {@code anyClaims}. */
	private static final class FakeAvailability implements SetAvailabilityLookup {
		boolean claimed;
		int anyClaimsCalls;

		@Override
		public Set<SetId> takenOn(Collection<SetId> setIds, java.time.LocalDate date) {
			return Set.of();
		}

		@Override
		public boolean anyClaims(Collection<SetId> setIds) {
			anyClaimsCalls++;
			return claimed;
		}

		@Override
		public java.util.Map<SetId, String> statesOn(Collection<SetId> setIds, java.time.LocalDate date) {
			return java.util.Map.of();
		}
	}

	/** Programmable {@link BookingPresence}: {@code hasBookings} drives the guard. */
	private static final class FakeBookings implements BookingPresence {
		boolean hasBookings;

		@Override
		public boolean hasBookings(VenueId venueId) {
			return hasBookings;
		}
	}
}
