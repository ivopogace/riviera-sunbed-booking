package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Everything the booking-view screen shows (U6): the booking summary (code, {@code status}, venue +
 * set display, date, the gross {@code amount} paid) plus the <strong>server-computed</strong>
 * cancellation terms (invariant #10) — whether it is still {@code cancellable} ({@code CONFIRMED}
 * <em>and</em> the cancellation window still open, so a stay whose service day has begun reports
 * {@code false}), whether free cancellation is still open ({@code beforeCutoff}), the
 * {@code refundIfCancelledNow} (0 once the window has closed),
 * and, once cancelled, the {@code refundedAmount} actually issued ({@code null} otherwise). Money is
 * integer minor units (invariant #5). Request-to-Book adds {@code requestExpiresAt}
 * (the venue-response deadline; {@code null} for instant bookings) and {@code payment} — the open
 * PaymentIntent's credentials, present <strong>only</strong> while {@code AWAITING_PAYMENT} with a
 * payable intent on record, so an accepted guest can pay from this code-gated view. A pure value
 * carried out of the use case.
 *
 * <p>{@code withdrawable} is the guest's own retraction of a still-open request
 * ({@code PENDING_REQUEST}) — a <strong>separate</strong> flag from {@code cancellable}, not a
 * widening of it. The two answer different questions about different states, and only ever one of
 * them is true; collapsing them would tie the withdraw to the cancellation policy, which has no say
 * here (no money was ever collected).
 *
 * <p>{@code emailWithheld} says the confirmation mail was suppressed, so the post-payment
 * surface can tell the guest the code on screen is their only record. It is {@code true} only for a
 * {@code CONFIRMED} booking whose address is on the do-not-mail list; for every other status it is
 * {@code false} <em>without the question being asked</em> — the `202` create hands out the code
 * before payment, so answering earlier would make this code-gated view a suppression oracle (D-8).
 *
 * <p>{@code payWindowClosed} says the booking's pay deadline — {@code min(accepted_at + pay-window,
 * end of service day)} — has passed, so no payment may be taken for it any more (invariant #4) and
 * {@code payment} is {@code null} whatever the status. It is carried rather than derived on the
 * client because the deadline arithmetic is the server's ({@code Europe/Tirane}, invariant #6).
 *
 * <p>{@code cancelReason} says <em>which</em> cancellation a {@code CANCELLED} booking went through,
 * so the guest can be told; {@code null} for every other status, and also for a cancellation that
 * never charged (the abandoned-payment release stamps no reason). It is carried because
 * {@code refundedAmount} alone cannot separate a venue's weather refund from the guest's own
 * cancellation — both return money, only one is news to the guest.
 *
 * <p>{@code reviewPanel} is what this stay's review section should show — the form, the guest's own
 * verdict, a frozen one, or the reason there is none. It is carried rather than derived from
 * {@code status} because every fence behind it is review's, not booking's: a {@code COMPLETED} stay
 * stops being reviewable without its status moving at all.
 *
 * <p>{@code reviewNameSuggestion} is booking's own addition beside it — the first name from the
 * contact on this booking, so the review form can prefill a display name. {@code null} unless the
 * panel is {@code Eligible}, and {@code null} when the contact is gone: it is a convenience, never
 * a disclosure the panel depends on.
 *
 * <p>{@code refundOutstanding} says the gateway has collected for this cancelled booking but not yet
 * accepted its refund, so the surface must say the refund is being processed rather than on its way
 * to the card. {@code false} everywhere else — including when the wired gateway never collected
 * (the stub profile), where the refund decision reads as it always has.
 */
public record BookingDetail(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, MoneyView amount, boolean cancellable,
		boolean withdrawable, boolean beforeCutoff, MoneyView refundIfCancelledNow,
		MoneyView refundedAmount, boolean refundOutstanding,
		java.time.Instant requestExpiresAt,
		ai.riviera.platform.payment.vocabulary.PaymentCredentials payment, boolean emailWithheld,
		boolean payWindowClosed, RefundReason cancelReason,
		CancellationWindow cancellationWindowAtBirth, ReviewPanel reviewPanel,
		String reviewNameSuggestion) {
}
