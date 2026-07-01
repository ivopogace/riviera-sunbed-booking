package ai.riviera.platform.booking.application.cancel;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.RefundPolicy;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * The one place the server-side cancellation refund is computed (invariant #10) — shared by the view
 * (what you'd get if you cancelled now) and the cancel (what is actually refunded) use cases so the
 * rule can never drift between them. Resolves the set's cutoff/display from {@code venue::api},
 * applies the evening-before boundary ({@link BookingCutoff}, {@code Europe/Tirane}) and the venue's
 * late-cancel share via {@link RefundPolicy}. Module-internal but {@code public} so the {@code view}
 * slice ({@code ViewBookingService}) can quote the same refund the {@code cancel} slice actions —
 * the rule lives in one place across use-case sub-packages. Not exported: {@code application} is not a
 * {@code @NamedInterface}, so it stays inside the {@code booking} module (invariant #11).
 */
@Component
public class CancellationPolicy {

	private final VenueCatalog venueCatalog;
	private final BookingCutoff cutoff;

	CancellationPolicy(VenueCatalog venueCatalog, BookingCutoff cutoff) {
		this.venueCatalog = venueCatalog;
		this.cutoff = cutoff;
	}

	/**
	 * The refund quote for a booking: the set facts (for display), whether free cancellation is still
	 * open, and the server-computed refund in minor units. Throws if the set is unknown (a booking FK
	 * to a missing set is a real invariant breach, not an expected flow).
	 */
	public RefundQuote quote(BookingRecord booking) {
		SetBookingInfo set = venueCatalog.setBookingInfo(booking.setId()).orElseThrow(() ->
				new IllegalStateException("no set info for set " + booking.setId().value()));
		boolean beforeCutoff = cutoff.freeCancellationOpen(set.bookingCutoff(), booking.bookingDate());
		int lateBps = beforeCutoff ? 0 : venueCatalog.lateCancelRefundBps(booking.venueId()).orElse(0);
		long refundMinor = RefundPolicy.refundMinor(booking.amountMinor(), beforeCutoff, lateBps);
		return new RefundQuote(set, beforeCutoff, refundMinor);
	}

	/** The computed cancellation terms: set display, free-cancellation status, and the refund due. */
	public record RefundQuote(SetBookingInfo set, boolean beforeCutoff, long refundMinor) {
	}
}
