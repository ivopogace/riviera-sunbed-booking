package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.NotVenueOwnerException;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;
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
	private final VenueAdminService service =
			new VenueAdminService(venues, new FakeOwnership(OWNER, VENUE));

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
	}
}
