package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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

		assertEquals(new VenueId(99), service.onboard(command));
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

	@Test
	void updateProfileByOwnerReplacesAmenitiesAndDistance() {
		venues.venues.add(VENUE.value());
		VenueProfileCommand command = new VenueProfileCommand(
				Set.of(Amenity.BEACH_BAR, Amenity.WIFI), 20);

		ChangeOutcome outcome = service.updateProfile(OWNER, VENUE, command);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedProfiles);
	}

	@Test
	void updateProfileOnUnknownVenueIsRejected() {
		// Owner passes the ownership guard, but the venue does not exist ⇒ 0 rows ⇒ NO_SUCH_VENUE.
		VenueProfileCommand command = new VenueProfileCommand(Set.of(), null);

		ChangeOutcome outcome = service.updateProfile(OWNER, VENUE, command);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((ChangeOutcome.Rejected) outcome).reason());
	}

	@Test
	void profileEditByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());
		VenueProfileCommand command = new VenueProfileCommand(Set.of(Amenity.CAFE), 10);

		// The ownership guard runs first: a stranger is rejected before any profile write.
		assertThrows(NotVenueOwnerException.class,
				() -> service.updateProfile(STRANGER, VENUE, command));
		assertEquals(0, venues.updatedProfiles);
	}

	// ---- Bulk layout replace (O3, issue #172) ----

	@Test
	void replacesLayoutForUnclaimedVenue() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(1, venues.deletedAllCount);
		assertEquals(6, venues.insertedInLayout);
	}

	@Test
	void rejectsReplaceWhenVenueHasBooking() {
		venues.venues.add(VENUE.value());
		bookings.hasBookings = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount); // guard runs BEFORE any delete
		assertEquals(0, venues.insertedInLayout);
	}

	@Test
	void rejectsReplaceWhenVenueHasAvailabilityHold() {
		venues.venues.add(VENUE.value());
		availability.claimed = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
	}

	@Test
	void rejectsEmptyLayout() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, new LayoutCommand(List.of()));

		assertEquals(ReplaceRejection.EMPTY_LAYOUT, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
	}

	@Test
	void rejectsDuplicateCellWithinTheBatch() {
		venues.venues.add(VENUE.value());
		LayoutCommand clashing = new LayoutCommand(List.of(
				new SetCommand("A", 1, "PREMIUM", "ONLINE", 2000, "EUR", 1, 1),
				new SetCommand("B", 2, "STANDARD", "ONLINE", 2000, "EUR", 1, 1))); // same grid cell

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, clashing);

		assertEquals(ReplaceRejection.CELL_TAKEN, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
	}

	@Test
	void rejectsReplaceOnUnknownVenue() {
		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, grid(1, 1));

		assertEquals(ReplaceRejection.NO_SUCH_VENUE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
	}

	@Test
	void replaceByANonOwnerIsDeniedBeforeAnyRead() {
		venues.venues.add(VENUE.value());

		assertThrows(NotVenueOwnerException.class, () -> service.replaceLayout(STRANGER, VENUE, grid(2, 3)));
		// Fail closed: the ownership guard fires before the claim probes and before any delete.
		assertEquals(0, availability.anyClaimsCalls);
		assertEquals(0, venues.deletedAllCount);
	}

	// ---- Per-row reprice (O4, issue #174) ----

	private static final RowPriceCommand REPRICE_CMD = new RowPriceCommand("A", 4200, "EUR");

	@Test
	void repricesRowForOwnedVenue() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, REPRICE_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.repricedRows);
	}

	@Test
	void repriceOnUnknownVenueIsRejectedBeforeAnyWrite() {
		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.repricedRows);
	}

	@Test
	void repriceOfARowWithNoSetsIsNotFound() {
		// The venue exists but no set carries the row label ⇒ the UPDATE touches 0 rows ⇒ NO_SUCH_ROW.
		venues.venues.add(VENUE.value());
		venues.forceRepriceRows = 0;

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
	}

	@Test
	void repriceByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// Invariant #13: the ownership guard is the first act — a stranger is denied before the UPDATE.
		assertThrows(NotVenueOwnerException.class, () -> service.repriceRow(STRANGER, VENUE, REPRICE_CMD));
		assertEquals(0, venues.repricedRows);
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

		@Override
		public long insertVenue(NewVenueCommand command) {
			insertedVenues++;
			return nextVenueId;
		}

		@Override
		public boolean venueExists(VenueId venueId) {
			return venues.contains(venueId.value());
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
		public int updateVenueProfile(VenueId venueId, VenueProfileCommand command) {
			updatedProfiles++;
			return venues.contains(venueId.value()) ? 1 : 0;
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
