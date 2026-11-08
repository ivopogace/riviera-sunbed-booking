package ai.riviera.platform.booking.application.reserve;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.reserve.StayReserveOutcome.ReservedStretch;
import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.api.CollectionGuarantee;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The collect leg of a stay, with fakes around the real {@link CreateStayService}: which venue each
 * share pays, and how a refused collection releases every stretch. The reserve phase has its own ITs.
 */
class CreateStayServiceTest {

	private static final LocalDate DAY = LocalDate.of(2026, 12, 1);

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));

	private final ReserveStayService reservation = mock(ReserveStayService.class);

	private final CreateStayCommand command = mock(CreateStayCommand.class);

	private final List<BookingId> released = new ArrayList<>();

	private final ReleaseAbandonedBooking release = released::add;

	private static SetBookingInfo set(long setId, long venueId) {
		return new SetBookingInfo(new SetId(setId), new VenueId(venueId), "Miramar", "Front row", 2, Pool.ONLINE,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0), BookingMode.INSTANT,
				SeasonClosure.open(), null);
	}

	private CreateStayService service(CheckoutPort checkout) {
		return new CreateStayService(reservation, checkout, mock(ConfirmBooking.class), release,
				mock(ConfirmationMailDelivery.class), mock(CollectionGuarantee.class), CLOCK);
	}

	private void reserved(ReservedStretch... stretches) {
		when(reservation.reserve(command)).thenReturn(new StayReserveOutcome.Reserved(new StayId(5L), "STAYCODE01",
				stretches[0].set(), new CustomerId(99L), List.of(stretches)));
	}

	@Test
	void aStayPaysTheVenueOfEveryStretch() {
		reserved(new ReservedStretch(41L, set(1L, 7L), DAY, DAY, 4500L),
				new ReservedStretch(42L, set(2L, 8L), DAY.plusDays(1), DAY.plusDays(1), 3000L));
		List<CollectionShare> paid = new ArrayList<>();

		service(shares -> {
			paid.addAll(shares);
			return new PaymentOutcome.Pending(new CheckoutInstruction.Embedded("cs", "pi"));
		}).create(command);

		assertEquals(List.of(new PayeeRef(7L), new PayeeRef(8L)), paid.stream().map(CollectionShare::payee).toList(),
				"each share names the venue of its own stretch's set");
	}

	@Test
	void aMixedCollectionReleasesEveryStretchAndIsRejected() {
		reserved(new ReservedStretch(41L, set(1L, 7L), DAY, DAY, 4500L),
				new ReservedStretch(42L, set(2L, 8L), DAY.plusDays(1), DAY.plusDays(1), 3000L));

		StayOutcome outcome = service(_ -> new PaymentOutcome.MixedPayees()).create(command);

		StayOutcome.Rejected rejected = assertInstanceOf(StayOutcome.Rejected.class, outcome);
		assertEquals(BookingOutcome.Rejected.SPANS_VENUES, rejected.reason(), "a typed refusal, never an exception");
		assertEquals(List.of(new BookingId(41L), new BookingId(42L)), released, "no stretch stays held");
	}
}
