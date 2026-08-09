package ai.riviera.platform.booking.application.cancel;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.CancellationWindow;
import ai.riviera.platform.booking.domain.RefundPolicy;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;

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

	private final SetBookingFacts setFacts;
	private final VenueRates rates;
	private final BookingCutoff cutoff;

	CancellationPolicy(SetBookingFacts setFacts, VenueRates rates, BookingCutoff cutoff) {
		this.setFacts = setFacts;
		this.rates = rates;
		this.cutoff = cutoff;
	}

	/**
	 * The refund quote for a booking: the set facts (for display), whether free cancellation is still
	 * open, and the server-computed refund in minor units. Throws if the set is unknown (a booking FK
	 * to a missing set is a real invariant breach, not an expected flow).
	 */
	public RefundQuote quote(BookingRecord booking) {
		SetBookingInfo set = setFacts.setBookingInfo(booking.setId()).orElseThrow(() ->
				new IllegalStateException("no set info for set " + booking.setId().value()));
		CancellationWindow window = cutoff.cancellationWindow(set.bookingCutoff(), booking.bookingDate());
		int lateBps = window == CancellationWindow.LATE
				? rates.lateCancelRefundBps(booking.venueId()).orElse(0)
				: 0;
		long refundMinor = RefundPolicy.refundMinor(booking.amountMinor(), window, lateBps);
		return new RefundQuote(set, window, refundMinor);
	}

	/**
	 * The computed cancellation terms: set display, which {@link CancellationWindow} the request
	 * falls in, and the refund due. {@code beforeCutoff} is derived rather than stored so the
	 * window stays the single carrier of the temporal decision.
	 */
	public record RefundQuote(SetBookingInfo set, CancellationWindow window, long refundMinor) {

		/** Whether free cancellation is still open — what the booking view reports on the wire. */
		public boolean beforeCutoff() {
			return window == CancellationWindow.FREE;
		}

		/** Whether a cancellation may still be actioned at all (invariant #10). */
		public boolean cancellationOpen() {
			return window != CancellationWindow.CLOSED;
		}

		/**
		 * Whether the service day has begun — the same boundary {@code CLOSED} already encodes, named
		 * for the pay path's use of it (invariant #4). Read off this quote rather than the clock a
		 * second time, so one response cannot offer a cancellation and declare the day open at once.
		 */
		public boolean serviceDayOpen() {
			return window == CancellationWindow.CLOSED;
		}
	}
}
