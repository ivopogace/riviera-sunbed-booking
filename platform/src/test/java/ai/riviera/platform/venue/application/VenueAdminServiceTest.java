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
			new SetCommand("Row A", 1, "PREMIUM", "ONLINE", 4500, "EUR", 2, 1);

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

	private final VenueAdminService service = new VenueAdminService(
			venues, new FakeOwnership(OWNER, VENUE), availability, bookings, CLOCK, CREATION);

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
				"INSTANT", "EUR", LocalTime.of(18, 0));

		// Creator-owns-on-create writes ownership too; the ownership write + non-owner denial is
		// proven end-to-end by CrossVenueDenialIT.creatorOwnsCreatedVenueAndOthersAreDenied.
		assertEquals(new VenueId(99), service.onboard(OWNER, command));
		assertEquals(1, venues.insertedVenues);
	}

	@Test
	void onboardStampsConfiguredDefaultCommission() {
		// A non-500 configured rate proves the stamp reads configuration, never a literal (AC-4).
		VenueAdminService configured = new VenueAdminService(venues,
				new FakeOwnership(OWNER, VENUE), availability, bookings, CLOCK,
				new VenueCreationProperties(700));
		NewVenueCommand command = new NewVenueCommand("Sunset", "Ksamil", "Riviera", "nice",
				"INSTANT", "EUR", LocalTime.of(18, 0));

		configured.onboard(OWNER, command);

		assertEquals(700, venues.lastInsertCommissionBps);
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

		// The locking read is the existence check now: no row to lock ⇒ NO_SUCH_SET, nothing deleted.
		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedSets);
	}

	@Test
	void editSetIsRefusedWhenAClaimedSetWouldBeRepositioned() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		SetCommand repooled = new SetCommand("Row A", 1, "PREMIUM", "WALK_IN", 4500, "EUR", 2, 1);
		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, repooled);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets, "the claimed set must keep the pool its booking assumes");
	}

	@Test
	void editSetIsRefusedWhenABookedSetWouldBeMovedToAnotherCell() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);
		bookings.setHasLiveBookings = true;

		SetCommand moved = new SetCommand("Row B", 4, "PREMIUM", "ONLINE", 4500, "EUR", 9, 3);
		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, moved);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets, "a guest was told this row and number");
	}

	@Test
	void editSetAppliesAPriceOnlyChangeToAClaimedSet() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // live, yet inert: a price-only edit never probes
		bookings.setHasLiveBookings = true;

		// Same pool, same row, same position, same cell — only tier and price move.
		SetCommand repriced = new SetCommand("Row A", 1, "STANDARD", "ONLINE", 9900, "EUR", 2, 1);
		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, repriced);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"a booking's charge is snapshotted at reserve time, so repricing is harmless");
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetAppliesEveryChangeToAnUnclaimedSet() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);

		SetCommand moved = new SetCommand("Row C", 7, "STANDARD", "WALK_IN", 100, "EUR", 5, 5);
		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, moved);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetIsAllowedWhenTheOnlyBookingIsTerminalAndTheOnlyHoldIsPast() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);
		// History only: the set is un-deletable (setHasBookings/claimed) but strands nobody.
		availability.holdOn.put(SET, TODAY_IN_TIRANE.minusDays(400)); // last season, nothing still owed
		bookings.setHasBookings = true;

		SetCommand moved = new SetCommand("Row B", 4, "PREMIUM", "WALK_IN", 4500, "EUR", 9, 3);
		ChangeOutcome outcome = service.editSet(OWNER, VENUE, SET, moved);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"last season's cancelled booking must not freeze the map forever");
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void editSetAsksAboutFutureHoldsOnlyForTheSetBeingEdited() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		venues.storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);

		service.editSet(OWNER, VENUE, SET, new SetCommand("Row Z", 9, "PREMIUM", "ONLINE", 4500, "EUR", 9, 9));

		assertEquals(List.of(SET), availability.anyClaimsFromAskedAbout,
				"the edit guard must ask about this set alone, never the whole venue");
		assertEquals(List.of("lockSet", "anyClaimsFrom"), callLog,
				"probing before locking reopens the window a claim slips through (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
	}

	@Test
	void removeSetAsksTheLiveHoldQuestionAboutTheSetAloneAndAfterTakingTheLock() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		service.removeSet(OWNER, VENUE, SET);

		assertEquals(List.of(SET), availability.anyClaimsFromAskedAbout,
				"a venue-wide probe here would freeze every set whenever any one is held");
		assertEquals(List.of("lockSet", "anyClaimsFrom"), callLog,
				"probing before locking reopens the window a claim slips through (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
	}

	@Test
	void everyPlacementFieldOnItsOwnDisturbsAClaimedSet() {
		SetPlacement stored = new SetPlacement("ONLINE", "Row A", 1, 2, 1);

		assertTrue(stored.disturbedBy(new SetCommand("Row A", 1, "PREMIUM", "WALK_IN", 1, "EUR", 2, 1)), "pool");
		assertTrue(stored.disturbedBy(new SetCommand("Row B", 1, "PREMIUM", "ONLINE", 1, "EUR", 2, 1)), "rowLabel");
		assertTrue(stored.disturbedBy(new SetCommand("Row A", 7, "PREMIUM", "ONLINE", 1, "EUR", 2, 1)), "positionNo");
		assertTrue(stored.disturbedBy(new SetCommand("Row A", 1, "PREMIUM", "ONLINE", 1, "EUR", 8, 1)), "gridX");
		assertTrue(stored.disturbedBy(new SetCommand("Row A", 1, "PREMIUM", "ONLINE", 1, "EUR", 2, 8)), "gridY");
		assertFalse(stored.disturbedBy(new SetCommand("Row A", 1, "STANDARD", "ONLINE", 9999, "EUR", 2, 1)),
				"tier and price never disturb a claim — the charge was snapshotted at reserve time");
	}

	@Test
	void removeSetIsRefusedWhenTheSetIsHeld() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

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

		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"last season's walk-in mark must not freeze the map forever");
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void removeSetIsRefusedWhenTheSetHasAnyBooking() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		bookings.setHasBookings = true;

		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedSets,
				"the RESTRICT FK would raise instead, which the caller sees as a 500");
	}

	@Test
	void removeSetAsksTheSetScopedBookingQuestionNotTheVenueScopedOne() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());
		bookings.hasBookings = true; // a booking elsewhere on the venue

		ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome,
				"a booking on a neighbouring set must not freeze this one");
		assertEquals(1, venues.deletedSets);
	}

	@Test
	void removeSetLocksTheSetRowBeforeProbingForClaims() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		service.removeSet(OWNER, VENUE, SET);

		assertEquals(1, venues.lockedSets,
				"without the row lock a claim committing after the probe is silently cascaded away");
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

	/** A valid widened profile command with the given amenities + distance; core fields fixed. */
	private static VenueProfileCommand profile(Set<Amenity> amenities, Integer distanceToWaterM) {
		return new VenueProfileCommand("Sunset", "Ksamil", "Riviera", "nice", "INSTANT",
				LocalTime.of(18, 0), amenities, distanceToWaterM);
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

	// ---- Bulk layout replace ----

	@Test
	void replacesLayoutForUnclaimedVenue() {
		venues.venues.add(VENUE.value());

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome);
		assertEquals(1, venues.deletedAllCount);
		assertEquals(6, venues.insertedInLayout);
		assertEquals(1, venues.incrementedSetVersions); // token advanced exactly once, on success
	}

	@Test
	void rejectsReplaceWhenVenueHasBooking() {
		venues.venues.add(VENUE.value());
		bookings.hasBookings = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount); // guard runs BEFORE any delete
		assertEquals(0, venues.insertedInLayout);
		// A LAYOUT_IN_USE reject must NOT advance the token (no spurious bump), so the
		// acting operator's own retry after the lock clears still works off the same loaded token.
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void rejectsReplaceWhenVenueHasLiveAvailabilityHold() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());
		availability.holdOn.put(SET, TODAY_IN_TIRANE); // the inclusive edge: a hold dated today still blocks

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
		assertEquals(0, venues.incrementedSetVersions); // no spurious bump on the in-use reject
	}

	@Test
	void replacesLayoutWhenTheOnlyHoldsArePast() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());
		// History only: a walk-in-only venue's marks from last season, no booking ever.
		availability.holdOn.put(SET, TODAY_IN_TIRANE.minusDays(400)); // last season, nothing still owed

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome,
				"last season's walk-in marks must not freeze the whole map forever");
		assertEquals(1, venues.deletedAllCount);
		assertEquals(1, venues.incrementedSetVersions);
	}

	@Test
	void rejectsReplaceWhenAnyLockedSetIsHeldNotJustTheFirst() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());
		SetId later = new SetId(SET.value() + 1);
		venues.existingSetIds.add(later.value());
		// On the LAST locked set: a guard probing only some of them would cascade this one away.
		availability.holdOn.put(later, TODAY_IN_TIRANE);

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(ReplaceRejection.LAYOUT_IN_USE, ((ReplaceLayoutOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedAllCount);
		assertEquals(0, venues.incrementedSetVersions);
	}

	@Test
	void replaceAsksTheLiveHoldQuestionAboutTheLockedSetsAfterLockingThem() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());
		SetId later = new SetId(SET.value() + 1);
		venues.existingSetIds.add(later.value());

		service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(List.of(SET, later), availability.anyClaimsFromAskedAbout,
				"the probe must ask about exactly the sets the lock covers — every one of them");
		assertEquals(List.of("lockSetsOfVenue", "anyClaimsFrom"), callLog,
				"probing before locking reopens the window a claim slips through (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not in UTC (invariant #6)");
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
		// AC-1 (unit): the venue exists but the locked set_version no longer matches the loaded token
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
		assertEquals(List.of(), callLog);
		assertEquals(0, venues.incrementedSetVersions);
		assertEquals(0, venues.deletedAllCount);
	}

	// ---- Per-row reprice ----

	private static final RowPriceCommand REPRICE_CMD = new RowPriceCommand("A", 4200, "EUR");

	@Test
	void repricesRowForOwnedVenue() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.repriceRow(OWNER, VENUE, 0L, REPRICE_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.repricedRows);
		assertEquals(1, venues.incrementedSetVersions); // token advanced once, on success
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
		assertEquals(0, venues.incrementedSetVersions); // fail closed before the version read/write too
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
				OTHER_OWNER, Set.of(new VenueRef(20)))), availability, bookings, CLOCK, CREATION);

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
		VenueAdminService owned = new VenueAdminService(store, new MultiOwnership(Map.of()),
				availability, bookings, CLOCK, CREATION);

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
		SetPlacement storedPlacement = new SetPlacement("ONLINE", "Row A", 1, 2, 1);

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

		@Override
		public void updateSet(VenueId venueId, SetId setId, SetCommand command) {
			updatedSets++;
		}

		@Override
		public void deleteSet(VenueId venueId, SetId setId) {
			deletedSets++;
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
		public List<SetId> setIdsOf(VenueId venueId) {
			return existingSetIds.stream().map(SetId::new).toList();
		}

		@Override
		public List<SetId> lockSetsOfVenue(VenueId venueId) {
			callLog.add("lockSetsOfVenue");
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

		@Override
		public java.util.Map<SetId, String> statesOn(Collection<SetId> setIds, java.time.LocalDate date) {
			return java.util.Map.of();
		}
	}

	/**
	 * Programmable {@link BookingPresence}. The three flags are separate so a test can pin both axes:
	 * the bulk replace asks the venue-scoped question while the per-set writes ask the set-scoped one,
	 * and the delete asks about any booking ever while the edit asks only about a live one.
	 */
	private static final class FakeBookings implements BookingPresence {
		boolean hasBookings;
		boolean setHasBookings;
		boolean setHasLiveBookings;

		@Override
		public boolean hasBookings(VenueId venueId) {
			return hasBookings;
		}

		@Override
		public boolean hasBookings(SetId setId) {
			return setHasBookings;
		}

		@Override
		public boolean hasLiveBookings(SetId setId) {
			return setHasLiveBookings;
		}
	}
}
