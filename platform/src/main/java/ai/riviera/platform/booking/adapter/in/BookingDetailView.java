package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;

import java.time.Instant;

/**
 * The {@code 200} response body for {@code GET /api/bookings/{code}} (U6) — the booking summary plus
 * the server-computed cancellation terms the Angular app renders. Money travels as {@link MoneyView}
 * (integer minor units + ISO currency, invariant #5); the date as an ISO {@code LocalDate} string.
 * {@code refundedAmount} is {@code null} unless the booking is already cancelled.
 * {@code emailWithheld} is {@code true} only for a {@code CONFIRMED} booking whose
 * confirmation mail was suppressed — never before payment, so this code-gated view cannot be used as
 * a suppression oracle (D-8). {@code payWindowClosed} says the service day has opened, so
 * {@code payment} is {@code null} and no payment may still be taken (invariant #4).
 * {@code cancelReason} names which cancellation a cancelled booking went through
 * ({@code POLICY}/{@code WEATHER}/{@code CONFLICT}), and is {@code null} both for a live booking and
 * for one cancelled without ever being charged. {@code refundOutstanding} is {@code true} only while
 * a cancelled booking's refund is decided but not yet accepted by the gateway — the panel then says
 * the refund is being processed instead of on its way. {@code reviewPanel} is the server's own answer
 * to "what should this stay's review section show?" — the client renders on its {@code kind}, never
 * on {@code status}. Mirrors the FE {@code BookingDetail} type.
 */
record BookingDetailView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, MoneyView amount, boolean cancellable, boolean withdrawable,
		boolean beforeCutoff, MoneyView refundIfCancelledNow, MoneyView refundedAmount,
		boolean refundOutstanding,
		Instant requestExpiresAt, PaymentCredentialsView payment, boolean emailWithheld,
		boolean payWindowClosed, String cancelReason, String cancellationWindowAtBirth,
		ReviewPanelView reviewPanel) {

	static BookingDetailView of(BookingDetail d) {
		return new BookingDetailView(d.code(), d.status().name(), d.venueId().value(), d.venueName(),
				d.rowLabel(), d.positionNo(), d.bookingDate().toString(), d.amount(), d.cancellable(),
				d.withdrawable(), d.beforeCutoff(), d.refundIfCancelledNow(), d.refundedAmount(),
				d.refundOutstanding(), d.requestExpiresAt(),
				d.payment() == null ? null
						: new PaymentCredentialsView(d.payment().clientSecret(),
								d.payment().paymentIntentId()),
				d.emailWithheld(), d.payWindowClosed(),
				d.cancelReason() == null ? null : d.cancelReason().name(),
				d.cancellationWindowAtBirth().name(),
				ReviewPanelView.of(d.reviewPanel(), d.reviewNameSuggestion()));
	}

	/**
	 * The panel flattened for the wire: one {@code kind} the client switches on, plus the fields that
	 * kind carries. Built by an exhaustive {@code switch} over the sealed panel, so a new variant is
	 * a compile error here rather than a silently absent {@code kind} in the browser.
	 *
	 * <p>{@code nameSuggestion} rides only on {@code ELIGIBLE}: it exists to prefill the form and has
	 * no meaning anywhere else.
	 */
	record ReviewPanelView(String kind, Instant windowClosesAt, OwnReviewView review,
			String nameSuggestion) {

		static ReviewPanelView of(ReviewPanel panel, String nameSuggestion) {
			return switch (panel) {
				case ReviewPanel.Eligible(Instant closesAt) ->
						new ReviewPanelView("ELIGIBLE", closesAt, null, nameSuggestion);
				case ReviewPanel.AlreadyReviewed(OwnReview review, Instant closesAt) ->
						new ReviewPanelView("ALREADY_REVIEWED", closesAt, OwnReviewView.of(review), null);
				case ReviewPanel.Frozen(OwnReview review) ->
						new ReviewPanelView("FROZEN", null, OwnReviewView.of(review), null);
				case ReviewPanel.Hidden(OwnReview review) ->
						new ReviewPanelView("HIDDEN", null, OwnReviewView.of(review), null);
				case ReviewPanel.WindowClosed ignored -> new ReviewPanelView("WINDOW_CLOSED", null, null, null);
				case ReviewPanel.NotCompleted ignored -> new ReviewPanelView("NOT_COMPLETED", null, null, null);
				case ReviewPanel.NoSuchStay ignored -> throw new IllegalStateException(
						"a booking read that already found its row cannot have no stay");
			};
		}
	}

	/** The guest's own review as they read it back; both texts are null on a slice-1 star-only row. */
	record OwnReviewView(int stars, String comment, String displayName) {

		static OwnReviewView of(OwnReview review) {
			return new OwnReviewView(review.stars(), review.comment(), review.displayName());
		}
	}

	/** The open PaymentIntent's credentials — present only while {@code AWAITING_PAYMENT}. */
	record PaymentCredentialsView(String clientSecret, String paymentIntentId) {
	}
}
