package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-tests the owner-asserted beach-map read at the application boundary: the map the catalogue
 * composes plus the locked sets ordered by id, ownership asserted <strong>before</strong> any
 * catalogue or claim probe so a non-owner learns nothing (invariant #13), and the empty-Optional
 * signal the controller maps to 404. Collaborators are mocked — the JDBC truths are pinned by
 * {@code VenueAdminControllerIT}.
 */
class BeachMapReadServiceTest {

	private static final OperatorId OWNER = new OperatorId(7L);
	private static final VenueId VENUE = new VenueId(42L);
	private static final LocalDate TODAY = LocalDate.of(2027, 6, 16);
	private static final MoneyView PRICE = new MoneyView(3000, "EUR");

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final VenueCatalog catalog = mock(VenueCatalog.class);
	private final LiveClaims claims = mock(LiveClaims.class);
	private final BeachMapReadService service = new BeachMapReadService(ownership, catalog, claims);

	private static SetView set(long id, int position) {
		return new SetView(id, "A", position, "STANDARD", Pool.ONLINE, PRICE, position, 1, "FREE");
	}

	private static VenueMapView map(List<SetView> sets) {
		return new VenueMapView(VENUE.value(), "V", "Ksamil", "Riviera", null, 0, 0, "INSTANT",
				PRICE, List.of(), null, sets, 4L, null, List.of(), true, "16:00");
	}

	@Test
	void answersTheMapAndItsLockedSetsOrderedBySetId() {
		VenueMapView map = map(List.of(set(9L, 1), set(3L, 2), set(5L, 3)));
		when(claims.today()).thenReturn(TODAY);
		when(catalog.findVenueMap(VENUE, TODAY)).thenReturn(Optional.of(map));
		SetLock nine = new SetLock(new SetId(9L), TODAY.plusDays(2), null);
		SetLock three = new SetLock(new SetId(3L), null, TODAY);
		when(claims.locksOn(List.of(new SetId(9L), new SetId(3L), new SetId(5L))))
				.thenReturn(Map.of(new SetId(9L), nine, new SetId(3L), three));

		Optional<OperatorBeachMap> read = service.beachMapFor(OWNER, VENUE);

		assertEquals(Optional.of(new OperatorBeachMap(map, List.of(three, nine))), read,
				"the catalogue's map rides untouched; locks sort by set id and the free set 5 is absent");
	}

	@Test
	void deniesNonOwnerBeforeAnyProbe() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value()))).when(ownership)
				.assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class, () -> service.beachMapFor(OWNER, VENUE));

		// 403 outranks 404 (invariant #13): nothing about the venue may be probed for a non-owner.
		verifyNoInteractions(catalog, claims);
	}

	@Test
	void aVenueTheMapReadAnswersNothingForIsEmptyAfterOwnershipPassed() {
		when(claims.today()).thenReturn(TODAY);
		when(catalog.findVenueMap(VENUE, TODAY)).thenReturn(Optional.empty());

		assertEquals(Optional.empty(), service.beachMapFor(OWNER, VENUE),
				"owned-but-unanswered venue signals empty (the controller's 404), never a phantom map");
	}
}
