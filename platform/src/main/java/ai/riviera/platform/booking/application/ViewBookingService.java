package ai.riviera.platform.booking.application;

import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.in.BookingDetail;
import ai.riviera.platform.booking.application.in.ViewBooking;
import ai.riviera.platform.booking.application.out.BookingRecord;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetBookingInfo;

/**
 * The view-a-booking use case (U6): load the booking by code and assemble its display + the
 * server-computed cancellation terms (invariant #10). The refund-if-cancelled-now is computed by the
 * shared {@link CancellationPolicy} — the same rule the cancel use case applies, so the displayed and
 * actioned refunds can never diverge. Package-private behind the {@link ViewBooking} port (invariant
 * #11); read-only, so no {@code @Transactional}.
 */
@Service
class ViewBookingService implements ViewBooking {

	private final Bookings bookings;
	private final CancellationPolicy cancellationPolicy;

	ViewBookingService(Bookings bookings, CancellationPolicy cancellationPolicy) {
		this.bookings = bookings;
		this.cancellationPolicy = cancellationPolicy;
	}

	@Override
	public Optional<BookingDetail> byCode(String code) {
		return bookings.findByCode(code).map(this::toDetail);
	}

	private BookingDetail toDetail(BookingRecord b) {
		RefundQuote quote = cancellationPolicy.quote(b);
		SetBookingInfo set = quote.set();
		boolean cancellable = b.status() == BookingStatus.CONFIRMED;

		MoneyView refunded = b.refundMinor() == null ? null
				: new MoneyView(b.refundMinor(), b.currency());
		return new BookingDetail(b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(),
				set.positionNo(), b.bookingDate(), new MoneyView(b.amountMinor(), b.currency()),
				cancellable, quote.beforeCutoff(), new MoneyView(quote.refundMinor(), b.currency()),
				refunded);
	}
}
