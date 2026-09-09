package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
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
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.LiveBookingCounts;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.NewVenueCommand;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.Venues;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Branch coverage for the venue write orchestration (U7, issue #7) with an in-memory fake
 * {@link Venues} — no Spring, no DB. Proves the existence checks and conflict→{@link SetRejection}
 * mapping (AC-1/2/3/5) without paying Testcontainers startup; the round-trip and DB constraints
 * are pinned by {@code VenueAdminControllerIT} and {@code BeachMapLayoutMigrationIT}. The per-venue
 * ownership guard is stubbed by {@link FakeOwnership} — {@link #OWNER} owns
 * {@link #VENUE}, anyone else is denied; the end-to-end 403 path is pinned by {@code CrossVenueDenialIT}.
 */
class VenueAdminServiceTest {

	private static final VenueId VENUE = new VenueId(7);
	private static final SetId SET = new SetId(42);
	private static final OperatorId OWNER = new OperatorId(100);
	private static final OperatorId STRANGER = new OperatorId(200);
	private static final SetCommand SET_CMD =
			new SetCommand("Row A", 1, "PREMIUM", Pool.ONLINE, 4500, "EUR", 2, 1);

	/** Ordered across BOTH fakes, so a test can pin that the row lock precedes the claim probe. */
	private final List<String> callLog = new ArrayList<>();

	private final FakeVenues venues = new FakeVenues(callLog);
	private final FakeAvailability availability = new FakeAvailability(callLog);
	private final FakeBookings bookings = new FakeBookings();
	/**
	 * Fixed late enough in the UTC day that Europe/Tirane has already rolled over: 22:30Z on the
	 * 15th is the 16th in Tirane. So a regression that reads the UTC date instead of the Tirane one
	 * (invariant #6) fails here, which a midday instant would have let pass.
	 */
	private static final Clock CLOCK = Clock.fixed(Instant.parse("2027-06-15T22:30:00Z"), ZoneOffset.UTC);
	private static final LocalDate TODAY_IN_TIRANE = LocalDate.of(2027, 6, 16);

	private static final VenueCreationProperties CREATION = new VenueCreationProperties(500);

	private final VenueAdminService service = new VenueAdminService(venues, new FakeOwnership(OWNER, VENUE));

	private final SeasonClosureService seasons =
			new SeasonClosureService(venues, new FakeOwnership(OWNER, VENUE), bookings, CLOCK);

	private final BeachMapEditService mapEditor = new BeachMapEditService(
			venues, new FakeOwnership(OWNER, VENUE), new LiveClaims(availability, bookings, CLOCK),
			bookings, CLOCK);

	private final OnboardVenueService onboarding =
			new OnboardVenueService(venues, new FakeOwnership(OWNER, VENUE), CREATION);

	private static LayoutCommand grid(int rows, int cols) {
		List<SetCommand> cells = new ArrayList<>();
		for (int y = 1; y <= rows; y++) {
			for (int x = 1; x <= cols; x++) {
				String tier = y == 1 ? "PREMIUM" : "STANDARD";
				cells.add(new SetCommand(String.valueOf((char) ('A' + y - 1)), x, tier, Pool.ONLINE,
						2000, "EUR", x, y));
			}
		}
		return new LayoutCommand(cells);
	}

	@Test
	void onboardReturnsTheInsertedVenueId() {
		venues.nextVenueId = 99;
		NewVenueCommand command = new NewVenueCommand("Sunset", "Ksamil", "Riviera", "nice",
				"INSTANT", "EUR", LocalTime.of(18, 0), null);

		// Creator-owns-on-create writes ownership too; the ownership write + non-owner denial is
		// proven end-to-end by CrossVenueDenialIT.creatorOwnsCreatedVenueAndOthersAreDenied.
		assertEquals(new VenueId(99), onboarding.onboard(OWNER, command));
		assertEquals(1, venues.insertedVenues);
	}

	@Test
	void onboardStampsConfiguredDefaultCommission() {
		// A non-500 configured rate proves the stamp reads configuration, never a literal (AC-4).
		OnboardVenueService configured = new OnboardVenueService(venues,
				new FakeOwnership(OWNER, VENUE), new VenueCreationProperties(700));
		NewVenueCommand command = new NewVenueCommand("Sunset", "Ksamil", "Riviera", "nice",
				"INSTANT", "EUR", LocalTime.of(18, 0), null);

		configured.onboard(OWNER, command);

		assertEquals(700, venues.lastInsertCommissionBps);
	}

	@Test
	void addSetToUnknownVenueIsRejectedAndNotInserted() {
		AddSetOutcome outcome = mapEditor.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetReturnsTheConflictAsRejection() {
		venues.venues.add(VENUE.value());
		venues.conflict = Optional.of(Venues.Conflict.CELL_TAKEN);

		AddSetOutcome outcome = mapEditor.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(SetRejection.CELL_TAKEN, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetInsertsAndReturnsTheNewId() {
		venues.venues.add(VENUE.value());
		venues.nextSetId = 123;

		AddSetOutcome outcome = mapEditor.addSet(OWNER, VENUE, SET_CMD);

		assertEquals(new SetId(123), ((AddSetOutcome.Added) outcome).setId());
		assertEquals(1, venues.insertedSets);
	}

	@Test
	void editUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets);
	}

	@Test
	void editExistingSetAppliesTheUpdate() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, SET_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void removeUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		// The locking read is the existence check now: no row to lock ⇒ NO_SUCH_SET, nothing deleted.
		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedSets);
	}

	@Test
	void editSetIsRefusedWhenAClaimedSetWouldBeRepositioned() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		SetCommand moved = new SetCommand("Row A", 2, "PREMIUM", Pool.ONLINE, 4500, "EUR", 3, 1);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, moved);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets, "a guest was told this row and number");
	}

	@Test
	void editSetAppliesAPoolOnlyChangeToAClaimedSet() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // live, yet inert: the pool governs new reserves only
		bookings.setHasLiveBookings = true;

		SetCommand repooled = new SetCommand("Row A", 1, "PREMIUM", Pool.WALK_IN, 4500, "EUR", 2, 1);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, repooled);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"invariant #3 is a reserve-time rule: the booked dates stay claimed by their own rows");
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetIsRefusedWhenABookedSetWouldBeMovedToAnotherCell() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);
		bookings.setHasLiveBookings = true;

		SetCommand moved = new SetCommand("Row B", 4, "PREMIUM", Pool.ONLINE, 4500, "EUR", 9, 3);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, moved);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets, "a guest was told this row and number");
	}

	@Test
	void editSetAppliesAPriceOnlyChangeToAClaimedSet() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // live, yet inert: a price-only edit never probes
		bookings.setHasLiveBookings = true;

		// Same pool, same row, same position, same cell — only tier and price move.
		SetCommand repriced = new SetCommand("Row A", 1, "STANDARD", Pool.ONLINE, 9900, "EUR", 2, 1);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, repriced);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"a booking's charge is snapshotted at reserve time, so repricing is harmless");
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetAppliesEveryChangeToAnUnclaimedSet() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);

		SetCommand moved = new SetCommand("Row C", 7, "STANDARD", Pool.WALK_IN, 100, "EUR", 5, 5);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, moved);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetIsAllowedWhenTheOnlyBookingIsTerminalAndTheOnlyHoldIsPast() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);
		// History only: the set is un-deletable (setHasBookings/claimed) but strands nobody.
		availability.holdOn.put(SET, TODAY_IN_TIRANE.minusDays(400)); // last season, nothing still owed
		bookings.setHasBookings = true;

		SetCommand moved = new SetCommand("Row B", 4, "PREMIUM", Pool.WALK_IN, 4500, "EUR", 9, 3);
		ChangeOutcome outcome = mapEditor.editSet(OWNER, VENUE, SET, moved);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"last season's cancelled booking must not freeze the map forever");
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetAsksAboutFutureHoldsOnlyForTheSetBeingEdited() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("Row A", 1, 2, 1);

		mapEditor.editSet(OWNER, VENUE, SET, new SetCommand("Row Z", 9, "PREMIUM", Pool.ONLINE, 4500, "EUR", 9, 9));

		assertEquals(List.of(SET), availability.anyClaimsFromAskedAbout,
				"the edit guard must ask about this set alone, never the whole venue");
		assertEquals(List.of("lockSet", "anyClaimsFrom", "updateSet"), callLog,
				"probing before locking reopens the window a claim slips through (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
	}

	@Test
	void removeSetAsksTheLiveHoldQuestionAboutTheSetAloneAndAfterTakingTheLock() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		mapEditor.removeSet(OWNER, VENUE, SET);

		assertEquals(List.of(SET), availability.anyClaimsFromAskedAbout,
				"a venue-wide probe here would freeze every set whenever any one is held");
		assertEquals(List.of("lockSet", "anyClaimsFrom", "deleteSet"), callLog,
				"probing before locking reopens the window a claim slips through (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
	}

	@Test
	void everyPositionFieldOnItsOwnDisturbsAClaimedSet() {
		SetPlacement stored = new SetPlacement("Row A", 1, 2, 1);

		assertTrue(new SetCommand("Row B", 1, "PREMIUM", Pool.ONLINE, 1, "EUR", 2, 1).disturbs(stored), "rowLabel");
		assertTrue(new SetCommand("Row A", 7, "PREMIUM", Pool.ONLINE, 1, "EUR", 2, 1).disturbs(stored), "positionNo");
		assertTrue(new SetCommand("Row A", 1, "PREMIUM", Pool.ONLINE, 1, "EUR", 8, 1).disturbs(stored), "gridX");
		assertTrue(new SetCommand("Row A", 1, "PREMIUM", Pool.ONLINE, 1, "EUR", 2, 8).disturbs(stored), "gridY");
		assertFalse(new SetCommand("Row A", 1, "STANDARD", Pool.WALK_IN, 9999, "EUR", 2, 1).disturbs(stored),
				"tier, price and pool never disturb a claim — the charge was snapshotted, the pool governs new reserves");
	}

	@Test
	void removeSetIsRefusedWhenTheSetIsHeld() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedSets,
				"the hold would be CASCADE-dropped by the delete, so nothing may be deleted");
	}

	@Test
	void removeSetIsAllowedWhenTheOnlyHoldIsPast() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		// History only: a walk-in marked last season, nothing still owed, no booking ever.
		availability.holdOn.put(SET, TODAY_IN_TIRANE.minusDays(400)); // last season, nothing still owed

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"last season's walk-in mark must not freeze the map forever");
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void removeSetRetiresASetWithOnlyTerminalBookings() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		bookings.setHasBookings = true; // history only: the FK pins the row, nobody is still coming

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.retiredSets, "a set with history leaves the map by retiring");
		assertEquals(0, venues.deletedSets, "the RESTRICT FK would raise instead, which the caller sees as a 500");
		assertEquals(CLOCK.instant(), venues.lastRetiredAt, "the marker is the service clock's instant (invariant #6)");
	}

	@Test
	void removeSetIsRefusedWhenTheSetHasALiveBooking() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		bookings.setHasBookings = true;
		bookings.setHasLiveBookings = true;

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.retiredSets, "a guest still coming keeps the set on the map");
		assertEquals(0, venues.deletedSets);
	}

	@Test
	void removeSetAsksTheSetScopedBookingQuestionNotTheVenueScopedOne() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		bookings.everBooked.add(new SetId(SET.value() + 1)); // a booking elsewhere on the venue

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"a booking on a neighbouring set must not freeze this one");
		assertEquals(1, venues.deletedSets);
		assertEquals(0, venues.retiredSets, "no history on this set, so it is deleted, not retired");
	}

	@Test
	void removeSetLocksTheSetRowBeforeProbingForClaims() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		mapEditor.removeSet(OWNER, VENUE, SET);

		assertEquals(1, venues.lockedSets,
				"without the row lock a claim committing after the probe is silently cascaded away");
	}


	@Test
	void removeExistingSetDeletesIt() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = mapEditor.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void addSetByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// The ownership guard runs first: a stranger is rejected before any existence check or insert.
		assertThrows(NotVenueOwnerException.class, () -> mapEditor.addSet(STRANGER, VENUE, SET_CMD));
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void editAndRemoveByANonOwnerAreDenied() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		assertThrows(NotVenueOwnerException.class, () -> mapEditor.editSet(STRANGER, VENUE, SET, SET_CMD));
		assertThrows(NotVenueOwnerException.class, () -> mapEditor.removeSet(STRANGER, VENUE, SET));
		assertEquals(0, venues.updatedSets);
		assertEquals(0, venues.deletedSets);
	}

	/** A valid widened profile command with the given amenities + distance; core fields fixed. */
	private static VenueProfileCommand profile(Set<Amenity> amenities, Integer distanceToWaterM) {
		return new VenueProfileCommand("Sunset", "Ksamil", "Riviera", "nice", "INSTANT",
				LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, amenities, distanceToWaterM);
	}

	@Test
	void updateProfileWithCurrentVersionApplies() {
		// The venue exists and the conditional UPDATE matches the loaded version ⇒ 1 row ⇒ APPLIED.
		venues.venues.add(VENUE.value());

		ProfileUpdateOutcome outcome = service.updateProfile(OWNER, VENUE, 0L,
				profile(Set.of(Amenity.BEACH_BAR, Amenity.WIFI), 20));

		assertEquals(ProfileUpdateOutcome.APPLIED, outcome);
		assertEquals(1, venues.updatedProfiles);
	}

	@Test
	void updateProfileWithStaleVersionIsStaleWrite() {
		// AC-1: the venue exists but the conditional UPDATE finds no row at the loaded version
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

	// ---- Owner-asserted profile READ ----

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

	// ---- Bulk layout save (the diff) ----

	/** A stored set at a cell no {@link #grid} names, so a save that keeps the grid removes it. */
	private static final SetPlacement OFF_GRID = new SetPlacement("Z", 9, 9, 9);
	private static final SetPlacement A1 = new SetPlacement("A", 1, 1, 1);

	@Test
	void savesAFreshLayoutAsInserts() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(6, venues.insertedInLayout);
		assertEquals(0, venues.updatedSets);
		assertEquals(1, venues.incrementedSetVersions); // token advanced exactly once, on success
	}

	@Test
	void aKeptCellIsUpdatedUnderItsOwnIdAndOnlyNewCellsAreInserted() {
		venues.venues.add(VENUE.value());
		venues.place(SET, A1);

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(List.of(SET), venues.updatedSetIds, "the set at A1 keeps its identity");
		assertEquals(5, venues.insertedInLayout);
		assertEquals(0, venues.deletedSets + venues.retiredSets);
		assertEquals(1, venues.incrementedSetVersions);
	}

	@Test
	void refusesRemovingASetWithALiveBookingAndNamesIt() {
		venues.venues.add(VENUE.value());
		venues.place(SET, OFF_GRID);
		bookings.liveOn.put(SET, TODAY_IN_TIRANE.plusDays(3));

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(new ReplaceLayoutOutcome.SetsInUse(List.of(new BlockedSet(
				new PlacedSet(SET, OFF_GRID), new SetLock(SET, TODAY_IN_TIRANE.plusDays(3), null)))), outcome);
		assertEquals(0, venues.deletedSets + venues.retiredSets + venues.updatedSets + venues.insertedInLayout,
				"a refused save writes nothing");
		assertEquals(0, venues.incrementedSetVersions, "no spurious bump on the in-use refusal");
	}

	@Test
	void refusesRemovingASetWithALiveHoldAndNamesIt() {
		venues.venues.add(VENUE.value());
		venues.place(SET, OFF_GRID);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(new ReplaceLayoutOutcome.SetsInUse(List.of(new BlockedSet(
				new PlacedSet(SET, OFF_GRID), new SetLock(SET, null, TODAY_IN_TIRANE)))), outcome);
		assertEquals(0, venues.deletedSets + venues.retiredSets);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void aClaimOnAKeptCellNeverRefuses() {
		venues.venues.add(VENUE.value());
		venues.place(SET, A1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE);
		bookings.liveOn.put(SET, TODAY_IN_TIRANE);

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome,
				"an in-place update disturbs no guest: price, tier, pool and row label are always editable");
		assertEquals(List.of(SET), venues.updatedSetIds);
		assertEquals(List.of(), availability.nearestClaimsFromAskedAbout, "a kept set is never probed");
	}

	@Test
	void refusesRepositioningAKeptClaimedSetButNotRenamingIt() {
		venues.venues.add(VENUE.value());
		venues.place(SET, A1);
		bookings.liveOn.put(SET, TODAY_IN_TIRANE.plusDays(3));
		LayoutCommand renamed = new LayoutCommand(List.of(
				new SetCommand("Front", 1, "PREMIUM", Pool.ONLINE, 2000, "EUR", 1, 1)));
		LayoutCommand renumbered = new LayoutCommand(List.of(
				new SetCommand("A", 7, "PREMIUM", Pool.ONLINE, 2000, "EUR", 1, 1)));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, mapEditor.replaceLayout(OWNER, VENUE, 0L, renamed),
				"a row label changes in place on a booked set, as a rename does");
		assertEquals(new ReplaceLayoutOutcome.SetsInUse(List.of(new BlockedSet(
				new PlacedSet(SET, A1), new SetLock(SET, TODAY_IN_TIRANE.plusDays(3), null)))),
				mapEditor.replaceLayout(OWNER, VENUE, 0L, renumbered),
				"a guest was told this row and number: a new number on a claimed set is refused and named");
	}

	@Test
	void parksTheLabelsOfSwappedRowsBeforeUpdatingThem() {
		venues.venues.add(VENUE.value());
		SetId b1 = new SetId(SET.value() + 1);
		venues.place(SET, A1);
		venues.place(b1, new SetPlacement("B", 1, 1, 2));
		LayoutCommand swapped = new LayoutCommand(List.of(
				new SetCommand("B", 1, "PREMIUM", Pool.ONLINE, 2000, "EUR", 1, 1),
				new SetCommand("A", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 2)));

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, swapped);

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(List.of(SET, b1), venues.parkedSetIds, "both sets move into each other's slot");
		assertEquals(List.of("lockSetsOfVenue", "nearestClaimsFrom", "parkRowLabels", "updateSet", "updateSet", "insertSets"),
				callLog, "the parking precedes every in-place update");
	}

	@Test
	void retiresARemovedSetWithHistoryAndDeletesOneWithout() {
		venues.venues.add(VENUE.value());
		SetId clean = new SetId(SET.value() + 1);
		venues.place(SET, OFF_GRID);
		venues.place(clean, new SetPlacement("Z", 8, 8, 9));
		bookings.everBooked.add(SET); // finished history: the FK pins the row, nobody is still coming

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(1, venues.retiredSets, "a set with history leaves the map by retiring (ADR-0019)");
		assertEquals(CLOCK.instant(), venues.lastRetiredAt, "the marker is the service clock's instant (invariant #6)");
		assertEquals(1, venues.deletedSets, "a set with no booking is deleted");
		assertEquals(1, venues.incrementedSetVersions);
	}

	@Test
	void removesASetWhoseOnlyHoldsArePast() {
		venues.venues.add(VENUE.value());
		venues.place(SET, OFF_GRID);
		availability.holdOn.put(SET, TODAY_IN_TIRANE.minusDays(400)); // last season, nothing still owed

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome,
				"last season's walk-in marks must not freeze the map");
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void namesEveryRefusedSetNotJustTheFirst() {
		venues.venues.add(VENUE.value());
		SetId later = new SetId(SET.value() + 1);
		venues.place(SET, OFF_GRID);
		venues.place(later, new SetPlacement("Z", 8, 8, 9));
		availability.holdOn.put(later, TODAY_IN_TIRANE); // on the LAST removed set

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(List.of(later), ((ReplaceLayoutOutcome.SetsInUse) outcome).sets().stream()
				.map(blocked -> blocked.set().id()).toList(), "only the sets a claim pins are named");
		assertEquals(0, venues.deletedSets + venues.retiredSets);
	}

	@Test
	void probesOnlyTheRemovedSetsAfterLockingTheMap() {
		venues.venues.add(VENUE.value());
		SetId gone = new SetId(SET.value() + 1);
		venues.place(SET, A1);
		venues.place(gone, OFF_GRID);

		mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(List.of(gone), availability.nearestClaimsFromAskedAbout,
				"the probe asks about exactly the removed sets — every one of them, none of the kept");
		assertEquals(List.of("lockSetsOfVenue", "nearestClaimsFrom", "deleteSet", "updateSet", "insertSets"), callLog,
				"lock, then probe (invariant #2), then removals before the in-place updates and the inserts");
		assertEquals(TODAY_IN_TIRANE, availability.nearestClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
	}

	@Test
	void rejectsEmptyLayout() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, new LayoutCommand(List.of()));

		assertEquals(LayoutRejection.EMPTY_LAYOUT, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(List.of(), callLog);
	}

	@Test
	void rejectsDuplicateCellWithinTheBatch() {
		venues.venues.add(VENUE.value());
		LayoutCommand clashing = new LayoutCommand(List.of(
				new SetCommand("A", 1, "PREMIUM", Pool.ONLINE, 2000, "EUR", 1, 1),
				new SetCommand("B", 2, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1))); // same grid cell

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, clashing);

		assertEquals(LayoutRejection.CELL_TAKEN, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(List.of(), callLog);
	}

	@Test
	void rejectsALayoutSharingOneLabelAcrossTwoGridRows() {
		venues.venues.add(VENUE.value());
		// The #728 reproducer: gap-cell numbering keeps every (rowLabel, positionNo) pair unique.
		LayoutCommand split = new LayoutCommand(List.of(
				new SetCommand("A", 2, "PREMIUM", Pool.ONLINE, 2000, "EUR", 2, 1),
				new SetCommand("A", 3, "PREMIUM", Pool.ONLINE, 2000, "EUR", 3, 1),
				new SetCommand("A", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 2)));

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, split);

		assertEquals(LayoutRejection.ROW_NAME_TAKEN, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedInLayout);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void duplicatePositionOutranksTheSplitLabel() {
		venues.venues.add(VENUE.value());
		LayoutCommand doubleFault = new LayoutCommand(List.of(
				new SetCommand("A", 1, "PREMIUM", Pool.ONLINE, 2000, "EUR", 1, 1),
				new SetCommand("A", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 2)));

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, doubleFault);

		assertEquals(LayoutRejection.DUPLICATE_POSITION, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
	}

	@Test
	void acceptsOneLabelSpanningManyPositionsOnOneGridRow() {
		venues.venues.add(VENUE.value());
		// Gap-cell numbering on a single grid row — same label repeated is the normal shape, never a split.
		LayoutCommand gapped = new LayoutCommand(List.of(
				new SetCommand("A", 2, "PREMIUM", Pool.ONLINE, 2000, "EUR", 2, 1),
				new SetCommand("A", 3, "PREMIUM", Pool.ONLINE, 2000, "EUR", 3, 1)));

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, gapped);

		assertEquals(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(2, venues.insertedInLayout);
	}

	@Test
	void rejectsReplaceOnUnknownVenue() {
		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(1, 1));

		assertEquals(LayoutRejection.NO_SUCH_VENUE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
	}

	@Test
	void replaceWithStaleSetVersionIsStaleWrite() {
		// STALE_WRITE precedes the map lock, the probe and every write; the token is never advanced.
		venues.venues.add(VENUE.value());
		venues.place(SET, A1);
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		ReplaceLayoutOutcome outcome = mapEditor.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(LayoutRejection.STALE_WRITE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(List.of(), callLog);
		assertEquals(0, venues.updatedSets + venues.insertedInLayout);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void replaceByANonOwnerIsDeniedBeforeAnyRead() {
		venues.venues.add(VENUE.value());

		assertThrows(NotVenueOwnerException.class,
				() -> mapEditor.replaceLayout(STRANGER, VENUE, 0L, grid(2, 3)));
		// Fail closed: the ownership guard fires before the claim probes, the version read/write, any write.
		assertEquals(List.of(), callLog);
		assertEquals(0, venues.incrementedSetVersions);
		assertEquals(0, venues.insertedInLayout);
	}

	// ---- Batch apply ----

	private static final SetBatchCommand BATCH_CMD =
			new SetBatchCommand(Set.of(SET, new SetId(43)), "PREMIUM", Pool.WALK_IN, 4000L, "EUR");

	private void seedBatchSets() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.sets.put(43L, VENUE.value());
	}

	@Test
	void batchAppliesToEveryNamedSetAndAdvancesTheTokenOnce() {
		seedBatchSets();
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // live, yet inert: no claim question on price/tier/pool
		bookings.setHasLiveBookings = true;

		SetBatchOutcome outcome = mapEditor.applyToSets(OWNER, VENUE, 0L, BATCH_CMD);

		assertEquals(new SetBatchOutcome.Applied(2), outcome);
		assertEquals(1, venues.batchUpdates);
		assertSame(BATCH_CMD, venues.lastBatch);
		assertEquals(1, venues.incrementedSetVersions);
		assertEquals(List.of(), availability.anyClaimsFromAskedAbout, "the batch never probes a claim");
	}

	@Test
	void batchLocksTheVenueRowThenTheSetRows() {
		seedBatchSets();

		mapEditor.applyToSets(OWNER, VENUE, 0L, BATCH_CMD);

		assertEquals(List.of("lockSets"), callLog,
				"the set rows are locked after the venue row (lockAndReadSetVersion) and before the write");
		assertEquals(Set.of(SET.value(), 43L), venues.lockedBatchIds);
	}

	@Test
	void batchWithAStaleTokenIsRefusedBeforeAnyWrite() {
		seedBatchSets();
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		SetBatchOutcome outcome = mapEditor.applyToSets(OWNER, VENUE, 0L, BATCH_CMD);

		assertEquals(SetRejection.STALE_WRITE, ((SetBatchOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.batchUpdates);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void batchNamingASetNotOnTheVenueIsRefusedWhole() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value()); // 43 belongs to nobody here

		SetBatchOutcome outcome = mapEditor.applyToSets(OWNER, VENUE, 0L, BATCH_CMD);

		assertEquals(SetRejection.NO_SUCH_SET, ((SetBatchOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.batchUpdates, "\"N sets updated\" must never overstate");
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void batchOnUnknownVenueIsRejectedBeforeAnyLock() {
		SetBatchOutcome outcome = mapEditor.applyToSets(OWNER, VENUE, 0L, BATCH_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((SetBatchOutcome.Rejected) outcome).reason());
		assertEquals(List.of(), callLog);
	}

	@Test
	void batchByANonOwnerIsDeniedBeforeAnyRead() {
		seedBatchSets();

		assertThrows(NotVenueOwnerException.class, () -> mapEditor.applyToSets(STRANGER, VENUE, 0L, BATCH_CMD));
		assertEquals(List.of(), callLog);
		assertEquals(0, venues.batchUpdates);
	}

	// ---- Per-row reprice ----

	private static final RowPriceCommand REPRICE_CMD = new RowPriceCommand("A", 4200, "EUR");

	@Test
	void repricesRowForOwnedVenue() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = mapEditor.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.repricedRows);
		assertEquals(1, venues.incrementedSetVersions); // token advanced once, on success
	}

	@Test
	void repriceOnUnknownVenueIsRejectedBeforeAnyWrite() {
		ChangeOutcome outcome = mapEditor.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.repricedRows);
	}

	@Test
	void repriceOfARowWithNoSetsIsNotFound() {
		// The venue exists but no set carries the row label ⇒ the UPDATE touches 0 rows ⇒ NO_SUCH_ROW.
		venues.venues.add(VENUE.value());
		venues.forceRepriceRows = 0;

		ChangeOutcome outcome = mapEditor.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
		// A NO_SUCH_ROW reject must NOT advance the token (no spurious bump), so the
		// acting operator's own next edit of a real row off the same loaded token still works.
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void repriceWithStaleSetVersionIsStaleWrite() {
		// AC-2 (unit): the venue exists but the locked set_version no longer matches the loaded token
		// (another writer advanced it) ⇒ STALE_WRITE, the reprice UPDATE is never attempted, and the token
		// is not advanced.
		venues.venues.add(VENUE.value());
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		ChangeOutcome outcome = mapEditor.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertEquals(SetRejection.STALE_WRITE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.repricedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void repriceByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());

		// Invariant #13: the ownership guard is the first act — a stranger is denied before the UPDATE.
		assertThrows(NotVenueOwnerException.class,
				() -> mapEditor.repriceRow(STRANGER, VENUE, 0L, REPRICE_CMD));
		assertEquals(0, venues.repricedRows);
		assertEquals(0, venues.incrementedSetVersions); // fail closed before the version read/write too
	}

	// ---- Per-row rename ----

	private static final RowNameCommand RENAME_CMD = new RowNameCommand("B", "Back row");

	@Test
	void renamesRowForOwnedVenue() {
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.renamedRows);
		assertEquals(1, venues.incrementedSetVersions); // token advanced once, on success
	}

	@Test
	void renameNeverProbesClaims() {
		// Unlike editSet/removeSet/replaceLayout, a rename asks neither availability nor booking.
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");
		availability.holdOn.put(SET, TODAY_IN_TIRANE);
		bookings.setHasLiveBookings = true;

		assertSame(ChangeOutcome.Applied.APPLIED, mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD));
		assertFalse(callLog.contains("anyClaimsFrom"));
	}

	@Test
	void rejectsARenameOntoAnotherRowsLabel() {
		// A shared label merges two rows wherever sets are grouped by it; the UNIQUE index misses that.
		venues.venues.add(VENUE.value());
		venues.rowLabels.addAll(Set.of("A", "B"));

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, new RowNameCommand("B", "A"));

		assertEquals(SetRejection.ROW_NAME_TAKEN, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.renamedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void allowsARenameToTheSameLabel() {
		// A no-op, not a self-collision — and it must not spend the token other tabs are holding.
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, new RowNameCommand("B", "B"));

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(0, venues.renamedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void renameOnUnknownVenueIsRejectedBeforeAnyWrite() {
		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.renamedRows);
	}

	@Test
	void renameOfARowWithNoSetsIsNotFound() {
		venues.venues.add(VENUE.value()); // no row carries "B"

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD);

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.renamedRows); // refused before the UPDATE, not by its rows-affected
		// A rejected rename leaves the token alone, so the acting tab's next write off it still works.
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void renameLosesTheRowToAConcurrentRemoveAndIsNotFound() {
		// A concurrent removeSet can empty the row after the label read — rows-affected is a real guard.
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");
		venues.forceRenameRows = 0;

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD);

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void renameOfAMissingRowOntoATakenLabelIsNotFoundNotTaken() {
		// Both refusals apply; the honest one names what is actually wrong — the row is gone.
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("A");

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, new RowNameCommand("B", "A"));

		assertEquals(SetRejection.NO_SUCH_ROW, ((ChangeOutcome.Rejected) outcome).reason());
	}

	@Test
	void renameStripsSurroundingWhitespaceSoItCannotDodgeTheDuplicateRefusal() {
		venues.venues.add(VENUE.value());
		venues.rowLabels.addAll(Set.of("A", "B"));

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, new RowNameCommand("B", " A "));

		assertEquals(SetRejection.ROW_NAME_TAKEN, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.renamedRows);
	}

	@Test
	void renameWithStaleSetVersionIsStaleWrite() {
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");
		venues.setVersionOnLock = 1; // the row moved to 1; the tab loaded 0

		ChangeOutcome outcome = mapEditor.renameRow(OWNER, VENUE, 0L, RENAME_CMD);

		assertEquals(SetRejection.STALE_WRITE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.renamedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void renameByANonOwnerIsDeniedBeforeAnyWrite() {
		venues.venues.add(VENUE.value());
		venues.rowLabels.add("B");

		// Invariant #13: the ownership guard is the first act — a stranger never reaches the UPDATE.
		assertThrows(NotVenueOwnerException.class,
				() -> mapEditor.renameRow(STRANGER, VENUE, 0L, RENAME_CMD));
		assertEquals(0, venues.renamedRows);
		assertEquals(0, venues.incrementedSetVersions);
	}

	// ---- Owned-venues read ----

	private static final OperatorId MULTI_OWNER = new OperatorId(7);
	private static final OperatorId OTHER_OWNER = new OperatorId(8);

	@Test
	void ownedByReturnsOnlyTheOperatorsOwnVenues() {
		// AC-1: "Aurora" (P's) sorts BEFORE both of O's, so a leak would land first and fail the assert.
		FakeVenues store = new FakeVenues(new ArrayList<>());
		store.summaries.put(12L, new OwnedVenueView(12, "Miramar Beach Club", "Dhërmi"));
		store.summaries.put(15L, new OwnedVenueView(15, "Sereno", "Jal"));
		store.summaries.put(20L, new OwnedVenueView(20, "Aurora", "Borsh"));
		VenueAdminService owned = new VenueAdminService(store, new MultiOwnership(Map.of(
				MULTI_OWNER, Set.of(new VenueRef(12), new VenueRef(15)),
				OTHER_OWNER, Set.of(new VenueRef(20)))));

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
		FakeVenues store = new FakeVenues(new ArrayList<>());
		VenueAdminService owned = new VenueAdminService(store, new MultiOwnership(Map.of()));

		assertEquals(List.of(), owned.ownedBy(MULTI_OWNER));
		assertEquals(List.of(), store.summaryQueries);
	}

	// --- closed for season: the owner-asserted state transition and its counts ---

	@Test
	void closeAssertsOwnershipBeforeAnythingElse() {
		venues.venues.add(VENUE.value());
		assertThrows(NotVenueOwnerException.class,
				() -> seasons.close(STRANGER, VENUE, SeasonClosure.closed(TODAY_IN_TIRANE.plusDays(30), false)));
		assertThrows(NotVenueOwnerException.class, () -> seasons.reopen(STRANGER, VENUE));
		assertEquals(0, venues.closures);
		assertEquals(0, venues.reopenings);
	}

	@Test
	void closeAndReopenRefuseAnUnknownVenue() {
		assertEquals(new CloseOutcome.Rejected(SeasonClosureRejection.NO_SUCH_VENUE),
				seasons.close(OWNER, VENUE, SeasonClosure.closed(null, false)));
		assertEquals(ReopenOutcome.NO_SUCH_VENUE, seasons.reopen(OWNER, VENUE));
	}

	@Test
	void closeRefusesAReopenDateNotAfterTodayInTirane() {
		venues.venues.add(VENUE.value());
		// 22:30Z on the 15th is already the 16th in Tirane: the 16th is today, so it is refused.
		assertEquals(new CloseOutcome.Rejected(SeasonClosureRejection.REOPEN_DATE_PASSED),
				seasons.close(OWNER, VENUE, SeasonClosure.closed(TODAY_IN_TIRANE, false)));
		assertEquals(new CloseOutcome.Rejected(SeasonClosureRejection.REOPEN_DATE_PASSED),
				seasons.close(OWNER, VENUE, SeasonClosure.closed(TODAY_IN_TIRANE.minusDays(1), true)));
		assertEquals(0, venues.closures);
	}

	@Test
	void closeStampsTheClosureAndAnswersTheCountsFromToday() {
		venues.venues.add(VENUE.value());
		bookings.liveCounts = new LiveBookingCounts(3, 2);
		SeasonClosure closure = SeasonClosure.closed(TODAY_IN_TIRANE.plusDays(1), true);

		assertEquals(new CloseOutcome.Closed(closure, new LiveBookingCounts(3, 2)),
				seasons.close(OWNER, VENUE, closure));
		assertEquals(1, venues.closures);
		assertEquals(closure, venues.lastClosure);
		assertEquals(CLOCK.instant(), venues.lastClosedAt);
		assertEquals(TODAY_IN_TIRANE, bookings.countedFrom, "the counts start on today in Tirane, not UTC");
	}

	@Test
	void closeWithoutAReopenDateHoldsIndefinitely() {
		venues.venues.add(VENUE.value());
		SeasonClosure closure = SeasonClosure.closed(null, false);
		assertEquals(new CloseOutcome.Closed(closure, new LiveBookingCounts(0, 0)),
				seasons.close(OWNER, VENUE, closure));
		assertEquals(closure, venues.lastClosure);
	}

	@Test
	void closeRefusesAnOpenValue() {
		venues.venues.add(VENUE.value());
		assertThrows(IllegalArgumentException.class, () -> seasons.close(OWNER, VENUE, SeasonClosure.open()));
	}

	@Test
	void reopenClearsTheClosure() {
		venues.venues.add(VENUE.value());
		assertEquals(ReopenOutcome.REOPENED, seasons.reopen(OWNER, VENUE));
		assertEquals(1, venues.reopenings);
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
		private final List<String> callLog;

		FakeVenues(List<String> callLog) {
			this.callLog = callLog;
		}

		final Set<Long> venues = new HashSet<>();
		final Map<Long, Long> sets = new HashMap<>(); // setId -> venueId
		Optional<Venues.Conflict> conflict = Optional.empty();
		long nextVenueId = 1;
		long nextSetId = 1;
		int insertedVenues;
		int lastInsertCommissionBps;
		int insertedSets;
		int updatedSets;
		int deletedSets;
		int retiredSets;
		Instant lastRetiredAt;
		int updatedProfiles;
		// null ⇒ the profile UPDATE matches the loaded version (1 row, APPLIED); set 0 to model a
		// stale version (another writer bumped it since the load ⇒ STALE_WRITE).
		Integer forceProfileUpdateRows;

		@Override
		public long insertVenue(NewVenueCommand command, int commissionBps) {
			insertedVenues++;
			lastInsertCommissionBps = commissionBps;
			return nextVenueId;
		}

		@Override
		public boolean venueExists(VenueId venueId) {
			return venues.contains(venueId.value());
		}

		int incrementedSetVersions;
		// What lockAndReadSetVersion returns. The set-write tests pass expectedVersion 0, so the
		// default 0 models a token match (proceed); set it to a different value to model a stale token
		// (another replace/reprice advanced it since the load ⇒ STALE_WRITE).
		long setVersionOnLock;

		@Override
		public long lockAndReadSetVersion(VenueId venueId) {
			return setVersionOnLock;
		}

		@Override
		public void incrementSetVersion(VenueId venueId) {
			// Counted so a test can assert the token advances ONLY on the success path.
			incrementedSetVersions++;
		}

		int lockedSets;
		// The placement the locked row reports; the per-set guard compares the command against it.
		SetPlacement storedPlacement = new SetPlacement("Row A", 1, 2, 1);

		@Override
		public Optional<SetPlacement> lockSet(VenueId venueId, SetId setId) {
			lockedSets++;
			callLog.add("lockSet");
			boolean present = venueId.value() == sets.getOrDefault(setId.value(), -1L);
			return present ? Optional.of(storedPlacement) : Optional.empty();
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

		final List<SetId> updatedSetIds = new ArrayList<>();
		final List<SetId> parkedSetIds = new ArrayList<>();

		@Override
		public void parkRowLabels(VenueId venueId, Collection<SetId> setIds) {
			callLog.add("parkRowLabels");
			parkedSetIds.addAll(setIds);
		}

		@Override
		public void updateSet(VenueId venueId, SetId setId, SetCommand command) {
			callLog.add("updateSet");
			updatedSets++;
			updatedSetIds.add(setId);
		}

		@Override
		public void deleteSet(VenueId venueId, SetId setId) {
			callLog.add("deleteSet");
			deletedSets++;
		}

		@Override
		public void retireSet(VenueId venueId, SetId setId, Instant retiredAt) {
			callLog.add("retireSet");
			retiredSets++;
			lastRetiredAt = retiredAt;
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
							BookingMode.INSTANT, LocalTime.of(18, 0), LocalTime.of(16, 0), 1500, "EUR",
							List.of(Amenity.WIFI), 20, 0, List.of(), SeasonClosure.open(), false))
					: Optional.empty();
		}

		int closures;
		int reopenings;
		SeasonClosure lastClosure;
		Instant lastClosedAt;

		@Override
		public void closeForSeason(VenueId venueId, SeasonClosure closure, Instant closedAt) {
			closures++;
			lastClosure = closure;
			lastClosedAt = closedAt;
		}

		@Override
		public void reopenForSeason(VenueId venueId) {
			reopenings++;
		}

		/** The active map, in id order: the bulk save's diff base. */
		final List<PlacedSet> placed = new ArrayList<>();
		int insertedInLayout;

		void place(SetId id, SetPlacement placement) {
			placed.add(new PlacedSet(id, placement));
		}

		@Override
		public List<SetId> setIdsOf(VenueId venueId) {
			return placed.stream().map(PlacedSet::id).toList();
		}

		@Override
		public java.util.OptionalLong setVersionOf(VenueId venueId) {
			throw new UnsupportedOperationException("a write never reads the token unlocked");
		}

		@Override
		public List<PlacedSet> placedSetsOf(VenueId venueId) {
			throw new UnsupportedOperationException("a write never reads the map unlocked");
		}

		@Override
		public List<PlacedSet> lockSetsOfVenue(VenueId venueId) {
			callLog.add("lockSetsOfVenue");
			return List.copyOf(placed);
		}

		final Set<Long> lockedBatchIds = new HashSet<>();
		int batchUpdates;
		SetBatchCommand lastBatch;

		@Override
		public Set<SetId> lockSets(VenueId venueId, Collection<SetId> setIds) {
			callLog.add("lockSets");
			lockedBatchIds.addAll(setIds.stream().map(SetId::value).toList());
			return setIds.stream()
					.filter(id -> venueId.value() == sets.getOrDefault(id.value(), -1L))
					.collect(Collectors.toSet());
		}

		@Override
		public int updateSetFields(VenueId venueId, SetBatchCommand command) {
			batchUpdates++;
			lastBatch = command;
			return command.setIds().size();
		}

		@Override
		public void insertSets(VenueId venueId, List<SetCommand> sets) {
			callLog.add("insertSets");
			insertedInLayout += sets.size();
		}

		// Seeded summaries, plus every id set asked for (so a test can assert what was NOT).
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

		int renamedRows;
		// null ⇒ a rename finds its sets (1 row updated); set to 0 to model a row emptied mid-write.
		Integer forceRenameRows;
		// The venue's labels, so the fake answers both questions a rename asks off one piece of state.
		final Set<String> rowLabels = new HashSet<>();

		@Override
		public Set<String> distinctRowLabels(VenueId venueId) {
			return Set.copyOf(rowLabels);
		}

		@Override
		public int renameRow(VenueId venueId, RowNameCommand command) {
			renamedRows++;
			return forceRenameRows != null ? forceRenameRows : 1;
		}
	}

	/**
	 * Programmable {@link SetAvailabilityLookup}. Holds are keyed <strong>per set and by date</strong>,
	 * the two dimensions the surviving probe actually discriminates on, so its answer depends on
	 * <em>which</em> sets were asked about and not merely on how the test was seeded. A boolean would
	 * let a "history only" test pass against a fake holding nothing, and a venue-wide flag would let a
	 * guard that probes only some of the locked sets pass while silently cascading the rest.
	 */
	private static final class FakeAvailability implements SetAvailabilityLookup {
		private final List<String> callLog;

		FakeAvailability(List<String> callLog) {
			this.callLog = callLog;
		}

		/** The day each set's hold sits on; a set with no entry is free. */
		final Map<SetId, java.time.LocalDate> holdOn = new HashMap<>();
		final List<SetId> anyClaimsFromAskedAbout = new ArrayList<>();
		java.time.LocalDate anyClaimsFromDate;

		@Override
		public Set<SetId> takenOn(Collection<SetId> setIds, java.time.LocalDate date) {
			return Set.of();
		}

		@Override
		public boolean anyClaimsFrom(Collection<SetId> setIds, java.time.LocalDate from) {
			anyClaimsFromAskedAbout.addAll(setIds);
			callLog.add("anyClaimsFrom");
			anyClaimsFromDate = from;
			// Mirrors `set_id IN (:ids) AND booking_date >= :from`, empty input included.
			return setIds.stream()
					.map(holdOn::get)
					.anyMatch(day -> day != null && !day.isBefore(from));
		}

		final List<SetId> nearestClaimsFromAskedAbout = new ArrayList<>();
		java.time.LocalDate nearestClaimsFromDate;

		@Override
		public java.util.Map<SetId, java.time.LocalDate> nearestClaimsFrom(
				Collection<SetId> setIds, java.time.LocalDate from) {
			nearestClaimsFromAskedAbout.addAll(setIds);
			callLog.add("nearestClaimsFrom");
			nearestClaimsFromDate = from;
			return setIds.stream()
					.filter(id -> holdOn.containsKey(id) && !holdOn.get(id).isBefore(from))
					.collect(java.util.stream.Collectors.toMap(id -> id, holdOn::get));
		}

		@Override
		public java.util.Map<SetId, List<java.time.LocalDate>> walkInHoldsFrom(Collection<SetId> setIds,
				java.time.LocalDate from) {
			return java.util.Map.of();
		}

		@Override
		public java.util.Map<SetId, String> statesOn(Collection<SetId> setIds, java.time.LocalDate date) {
			return java.util.Map.of();
		}

		@Override
		public java.util.Map<java.time.LocalDate, Integer> takenCountsBetween(
				Collection<SetId> setIds, java.time.LocalDate from, java.time.LocalDate to) {
			return java.util.Map.of();
		}
	}

	/**
	 * Programmable {@link BookingPresence}. The two booleans answer for whichever set is asked (the
	 * per-set writes name one); the per-set map and set answer the bulk save, which asks about many
	 * — a removal asks about any booking ever, an edit only about a live one.
	 */
	private static final class FakeBookings implements BookingPresence {
		boolean setHasBookings;
		boolean setHasLiveBookings;
		/** The nearest live booking per set. */
		final Map<SetId, LocalDate> liveOn = new HashMap<>();
		/** Sets with a booking of any status. */
		final Set<SetId> everBooked = new HashSet<>();
		LiveBookingCounts liveCounts = new LiveBookingCounts(0, 0);
		LocalDate countedFrom;

		@Override
		public LiveBookingCounts liveBookingsFrom(VenueId venueId, LocalDate from) {
			countedFrom = from;
			return liveCounts;
		}

		@Override
		public boolean hasBookings(SetId setId) {
			return setHasBookings || everBooked.contains(setId) || liveOn.containsKey(setId);
		}

		@Override
		public boolean hasLiveBookings(SetId setId) {
			return setHasLiveBookings || liveOn.containsKey(setId);
		}

		@Override
		public Map<SetId, LocalDate> nearestLiveBookings(Collection<SetId> setIds) {
			return setIds.stream()
					.filter(liveOn::containsKey)
					.collect(Collectors.toMap(id -> id, liveOn::get));
		}
	}
}
