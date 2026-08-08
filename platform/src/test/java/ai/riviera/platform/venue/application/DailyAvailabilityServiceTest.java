package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-tests the owner-asserted daily availability read at the application boundary:
 * per-set state tokens for the owner (AC-2), ownership asserted <strong>before</strong> any
 * existence/set lookup so a non-owner learns nothing (AC-3, invariant #13), and the empty-Optional
 * no-such-venue signal the controller maps to 404. Collaborators are mocked — the JDBC truths are
 * pinned by {@code AvailabilityLookupIT} and {@code VenueAdminControllerIT}.
 */
class DailyAvailabilityServiceTest {

	private static final OperatorId OWNER = new OperatorId(7L);
	private static final VenueId VENUE = new VenueId(42L);
	private static final LocalDate DATE = LocalDate.of(2026, 7, 15);

	private final Venues venues = mock(Venues.class);
	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final SetAvailabilityLookup availability = mock(SetAvailabilityLookup.class);
	private final DailyAvailabilityService service =
			new DailyAvailabilityService(venues, ownership, availability);

	@Test
	void returnsPerSetStatesForOwnedVenue() {
		List<SetId> sets = List.of(new SetId(1L), new SetId(2L), new SetId(3L));
		when(venues.venueExists(VENUE)).thenReturn(true);
		when(venues.setIdsOf(VENUE)).thenReturn(sets);
		when(availability.statesOn(sets, DATE)).thenReturn(
				Map.of(new SetId(3L), "STAFF_MARKED", new SetId(1L), "BOOKED_ONLINE"));

		Optional<List<SetDayState>> states = service.statesFor(OWNER, VENUE, DATE);

		assertEquals(Optional.of(List.of(
				new SetDayState(1L, "BOOKED_ONLINE"),
				new SetDayState(3L, "STAFF_MARKED"))), states,
				"held sets carry their state ordered by set id; the free set 2 is absent");
	}

	@Test
	void deniesNonOwnerBeforeExistenceCheck() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value()))).when(ownership)
				.assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class, () -> service.statesFor(OWNER, VENUE, DATE));

		// 403 outranks 404 (invariant #13): nothing about the venue may be probed for a non-owner.
		verifyNoInteractions(venues, availability);
	}

	@Test
	void unknownVenueIsEmptyAfterOwnershipPassed() {
		when(venues.venueExists(VENUE)).thenReturn(false);

		assertEquals(Optional.empty(), service.statesFor(OWNER, VENUE, DATE),
				"owned-but-vanished venue signals empty (controller's 404), never a phantom list");
	}

	@Test
	void venueWithNoHeldSetsYieldsAnEmptyList() {
		when(venues.venueExists(VENUE)).thenReturn(true);
		when(venues.setIdsOf(VENUE)).thenReturn(List.of(new SetId(9L)));
		when(availability.statesOn(any(), any())).thenReturn(Map.of());

		Optional<List<SetDayState>> states = service.statesFor(OWNER, VENUE, DATE);

		assertTrue(states.isPresent(), "the venue exists — an all-free day is a present, empty list");
		assertEquals(List.of(), states.get());
	}
}
