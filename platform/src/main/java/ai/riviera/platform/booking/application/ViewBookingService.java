package ai.riviera.platform.booking.application;

import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.in.BookingDetail;
import ai.riviera.platform.booking.application.in.ViewBooking;
import ai.riviera.platform.booking.application.out.BookingRecord;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.RefundPolicy;
import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * The view-a-booking use case (U6): load the booking by code and assemble its display + the
 * server-computed cancellation terms (invariant #10). The refund-if-cancelled-now is computed here
 * from the booking's gross, the evening-before cutoff ({@link BookingCutoff}, {@code Europe/Tirane})
 * and the venue's late-cancel policy ({@link VenueCatalog#lateCancelRefundBps}) — never supplied by
 * the client. Package-private behind the {@link ViewBooking} port (invariant #11); read-only, so no
 * {@code @Transactional}.
 */
@Service
class ViewBookingService implements ViewBooking {

	private final Bookings bookings;
	private final VenueCatalog venueCatalog;
	private final BookingCutoff cutoff;

	ViewBookingService(Bookings bookings, VenueCatalog venueCatalog, BookingCutoff cutoff) {
		this.bookings = bookings;
		this.venueCatalog = venueCatalog;
		this.cutoff = cutoff;
	}

	@Override
	public Optional<BookingDetail> byCode(String code) {
		return bookings.findByCode(code).map(this::toDetail);
	}

	private BookingDetail toDetail(BookingRecord b) {
		// venue/set always exist (booking FKs to set_position/venue) — absence is a real invariant breach.
		SetBookingInfo set = venueCatalog.setBookingInfo(b.setId()).orElseThrow(() ->
				new IllegalStateException("no set info for set " + b.setId().value()));
		boolean beforeCutoff = cutoff.freeCancellationOpen(set.bookingCutoff(), b.bookingDate());
		boolean cancellable = b.status() == BookingStatus.CONFIRMED;
		int lateBps = venueCatalog.lateCancelRefundBps(b.venueId()).orElse(0);
		long refundNow = RefundPolicy.refundMinor(b.amountMinor(), beforeCutoff, lateBps);

		MoneyView refunded = b.refundMinor() == null ? null
				: new MoneyView(b.refundMinor(), b.currency());
		return new BookingDetail(b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(),
				set.positionNo(), b.bookingDate(), new MoneyView(b.amountMinor(), b.currency()),
				cancellable, beforeCutoff, new MoneyView(refundNow, b.currency()), refunded);
	}
}
