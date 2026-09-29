package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The admin day-refund lookup's assembly (#1276 AC-4): the address resolves at {@code customer::api}, an
 * unknown address and a known one with no bookings answer alike, and each row carries its venue's name
 * from one batched {@code venue::api} read, {@code Unknown venue} when a set does not resolve.
 */
class GuestDayRefundLookupServiceTest {

	private static final String EMAIL = "guest@example.com";
	private static final CustomerId GUEST = new CustomerId(5L);
	private static final LocalDate FIRST = LocalDate.of(2026, 7, 18);

	private final CustomerLookup customers = mock(CustomerLookup.class);
	private final GuestBookingDays bookings = mock(GuestBookingDays.class);
	private final SetBookingFacts sets = mock(SetBookingFacts.class);

	private final GuestDayRefundLookupService service = new GuestDayRefundLookupService(customers, bookings, sets);

	private static GuestBookingRow row(long id, long setId) {
		return new GuestBookingRow(new BookingId(id), new SetId(setId), FIRST, FIRST.plusDays(2), BookingStatus.CONFIRMED,
				List.of(new GuestBookingDay(FIRST, GuestBookingDay.State.ATTENDED),
						new GuestBookingDay(FIRST.plusDays(1), GuestBookingDay.State.OPEN),
						new GuestBookingDay(FIRST.plusDays(2), GuestBookingDay.State.RELEASED)));
	}

	private static SetBookingInfo info(long setId, String venueName) {
		return new SetBookingInfo(new SetId(setId), new VenueId(1L), venueName, "A", 1, Pool.ONLINE,
				new MoneyView(4500L, "EUR"), LocalTime.of(10, 0), LocalTime.of(18, 0), BookingMode.INSTANT,
				SeasonClosure.open(), null);
	}

	@Test
	void anUnknownAddressIsEmptyWithoutReadingBookings() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.empty());

		assertEquals(List.of(), service.forEmail(EMAIL));

		verifyNoInteractions(bookings, sets);
	}

	@Test
	void aKnownAddressWithNoBookingsIsTheSameEmptyList() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.of(GUEST));
		when(bookings.forCustomer(GUEST)).thenReturn(List.of());

		assertEquals(List.of(), service.forEmail(EMAIL));

		verifyNoInteractions(sets);
	}

	@Test
	void rowsCarryTheirVenueNameFromOneBatchedRead() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.of(GUEST));
		when(bookings.forCustomer(GUEST)).thenReturn(List.of(row(42L, 7L), row(41L, 8L)));
		when(sets.setBookingInfos(any())).thenReturn(Map.of(new SetId(7L), info(7L, "Vala Beach")));

		List<GuestBooking> found = service.forEmail(EMAIL);

		assertEquals(2, found.size());
		assertEquals(new GuestBooking(new BookingId(42L), "Vala Beach", FIRST, FIRST.plusDays(2), BookingStatus.CONFIRMED,
				row(42L, 7L).days()), found.getFirst());
		assertEquals("Unknown venue", found.get(1).venueName(), "a set that does not resolve keeps its row");
	}
}
