package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.application.in.AddSetOutcome;
import ai.riviera.platform.venue.application.in.ChangeOutcome;
import ai.riviera.platform.venue.application.in.NewVenueCommand;
import ai.riviera.platform.venue.application.in.SetCommand;
import ai.riviera.platform.venue.application.in.SetRejection;
import ai.riviera.platform.venue.application.out.Venues;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * Branch coverage for the venue write orchestration (U7, issue #7) with an in-memory fake
 * {@link Venues} — no Spring, no DB. Proves the existence checks and conflict→{@link SetRejection}
 * mapping (AC-1/2/3/5) without paying Testcontainers startup; the round-trip and DB constraints
 * are pinned by {@code VenueAdminControllerIT} and {@code BeachMapLayoutMigrationIT}.
 */
class VenueAdminServiceTest {

	private static final VenueId VENUE = new VenueId(7);
	private static final SetId SET = new SetId(42);
	private static final SetCommand SET_CMD =
			new SetCommand("Row A", 1, "PREMIUM", "ONLINE", 4500, "EUR", 2, 1);

	private final FakeVenues venues = new FakeVenues();
	private final VenueAdminService service = new VenueAdminService(venues);

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
		AddSetOutcome outcome = service.addSet(VENUE, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_VENUE, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetReturnsTheConflictAsRejection() {
		venues.venues.add(VENUE.value());
		venues.conflict = Optional.of(Venues.Conflict.CELL_TAKEN);

		AddSetOutcome outcome = service.addSet(VENUE, SET_CMD);

		assertEquals(SetRejection.CELL_TAKEN, ((AddSetOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.insertedSets);
	}

	@Test
	void addSetInsertsAndReturnsTheNewId() {
		venues.venues.add(VENUE.value());
		venues.nextSetId = 123;

		AddSetOutcome outcome = service.addSet(VENUE, SET_CMD);

		assertEquals(new SetId(123), ((AddSetOutcome.Added) outcome).setId());
		assertEquals(1, venues.insertedSets);
	}

	@Test
	void editUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.editSet(VENUE, SET, SET_CMD);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.updatedSets);
	}

	@Test
	void editExistingSetAppliesTheUpdate() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = service.editSet(VENUE, SET, SET_CMD);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.updatedSets);
	}

	@Test
	void removeUnknownSetIsRejected() {
		venues.venues.add(VENUE.value());

		ChangeOutcome outcome = service.removeSet(VENUE, SET);

		assertEquals(SetRejection.NO_SUCH_SET, ((ChangeOutcome.Rejected) outcome).reason());
		assertEquals(0, venues.deletedSets);
	}

	@Test
	void removeExistingSetDeletesIt() {
		venues.venues.add(VENUE.value());
		venues.sets.put(SET.value(), VENUE.value());

		ChangeOutcome outcome = service.removeSet(VENUE, SET);

		assertSame(ChangeOutcome.Applied.APPLIED, outcome);
		assertEquals(1, venues.deletedSets);
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
			return venueId.value() == sets.getOrDefault(setId.value(), -1L);
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
	}
}
