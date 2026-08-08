package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Pins the queue's guest-name resolution to ONE batch lookup: N rows must not become N
 * {@code findById} round-trips. A missing contact (impossible via FK, defensive anyway) still
 * renders as an empty name rather than failing the whole queue; an empty queue asks the
 * {@code customer} module nothing at all. The ownership-first rule is pinned separately by
 * {@code CrossVenueDenialIT}.
 */
class PendingRequestsServiceTest {

	private static final OperatorId OPERATOR = new OperatorId(3);
	private static final VenueId VENUE = new VenueId(7);
	private static final CustomerId ANA = new CustomerId(101);
	private static final CustomerId BO = new CustomerId(102);

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final Bookings bookings = mock(Bookings.class);
	private final CustomerLookup customers = mock(CustomerLookup.class);

	private final PendingRequestsService service =
			new PendingRequestsService(ownership, bookings, customers);

	@Test
	void resolvesEveryGuestNameThroughOneBatchLookup() {
		when(bookings.findPendingRequestsForVenue(VENUE))
				.thenReturn(List.of(row(1, ANA), row(2, BO), row(3, ANA)));
		when(customers.findByIds(Set.of(ANA, BO)))
				.thenReturn(Map.of(ANA, contact("Ana Doe"), BO, contact("Bo Doe")));

		List<PendingRequest> queue = service.forVenue(OPERATOR, VENUE);

		assertEquals(List.of("Ana Doe", "Bo Doe", "Ana Doe"),
				queue.stream().map(PendingRequest::guestName).toList());
		verify(customers, never()).findById(any());
	}

	@Test
	void rendersAMissingContactAsAnEmptyName() {
		when(bookings.findPendingRequestsForVenue(VENUE)).thenReturn(List.of(row(1, ANA)));
		when(customers.findByIds(Set.of(ANA))).thenReturn(Map.of());

		List<PendingRequest> queue = service.forVenue(OPERATOR, VENUE);

		assertEquals("", queue.getFirst().guestName());
	}

	@Test
	void asksTheCustomerModuleNothingForAnEmptyQueue() {
		when(bookings.findPendingRequestsForVenue(VENUE)).thenReturn(List.of());

		assertEquals(List.of(), service.forVenue(OPERATOR, VENUE));
		verifyNoInteractions(customers);
	}

	private static PendingRequestRow row(long bookingId, CustomerId customerId) {
		return new PendingRequestRow(bookingId, new SetId(11), LocalDate.of(2026, 8, 10),
				customerId, 4500L, "EUR", Instant.parse("2026-08-01T08:00:00Z"),
				Instant.parse("2026-08-01T20:00:00Z"));
	}

	private static GuestContact contact(String fullName) {
		return new GuestContact("guest@example.com", fullName, "+355600111");
	}
}
