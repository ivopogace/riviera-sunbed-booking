package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;

import java.time.Instant;

/**
 * The {@code 200} body of {@code GET /api/bookings/{code}}, mirroring the FE {@code BookingDetail};
 * money as {@link MoneyView} (invariant #5). {@code refundedAmount} is null unless cancelled;
 * {@code cancelReason} (a {@code RefundReason} name) is null while live or if cancelled uncharged.
 * {@code payWindowClosed}: the pay deadline passed, so {@code payment} is null (invariant #4).
 * {@code refundOutstanding}: refund decided, not yet gateway-accepted. {@code emailWithheld} is true
 * only once {@code CONFIRMED}, else this code-gated view would be a suppression oracle.
 */
record BookingDetailView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, String lastDate, MoneyView amount, boolean cancellable,
		boolean withdrawable,
		boolean beforeCutoff, MoneyView refundIfCancelledNow, MoneyView refundedAmount,
		boolean refundOutstanding,
		Instant requestExpiresAt, PaymentCredentialsView payment, boolean emailWithheld,
		boolean payWindowClosed, String cancelReason, String cancellationWindowAtBirth,
		ReviewPanelView reviewPanel, MoveView move) {

	static BookingDetailView of(BookingDetail d) {
		return new BookingDetailView(d.code(), d.status().name(), d.venueId().value(), d.venueName(),
				d.rowLabel(), d.positionNo(), d.bookingDate().toString(), d.lastDate().toString(), d.amount(),
				d.cancellable(),
				d.withdrawable(), d.beforeCutoff(), d.refundIfCancelledNow(), d.refundedAmount(),
				d.refundOutstanding(), d.requestExpiresAt(),
				d.payment() == null ? null
						: new PaymentCredentialsView(d.payment().clientSecret(),
								d.payment().paymentIntentId()),
				d.emailWithheld(), d.payWindowClosed(),
				d.cancelReason() == null ? null : d.cancelReason().name(),
				d.cancellationWindowAtBirth().name(),
				ReviewPanelView.of(d.reviewPanel(), d.reviewNameSuggestion()),
				d.move() == null ? null : MoveView.of(d.move()));
	}

	/**
	 * The remodel move a booking went through, or {@code null}: the spot the guest was told before, the
	 * distance, when it moved and the free-exit deadline while it is still open (null once passed) —
	 * the full refund the guest can take until then whatever the tier would say.
	 */
	record MoveView(String fromRowLabel, int fromPositionNo, int rowsAway, int positionsAway, Instant movedAt,
			Instant freeExitUntil) {

		static MoveView of(ai.riviera.platform.booking.application.view.BookingMove move) {
			return new MoveView(move.fromRowLabel(), move.fromPositionNo(), move.rowsAway(), move.positionsAway(),
					move.movedAt(), move.freeExitUntil());
		}
	}

	/**
	 * The review panel flattened for the wire: one {@code kind} the client renders on, never on the
	 * booking's {@code status}, plus the fields that kind carries. An exhaustive {@code switch} over
	 * the sealed panel builds it, so a new variant is a compile error here, not a missing {@code kind}.
	 *
	 * <p>{@code nameSuggestion} rides only on {@code ELIGIBLE}: it exists to prefill the form.
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
