package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.StayConfirmation;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The stay summary every creation outcome shares: the group's one {@code code}, its status, venue,
 * span, total (invariant #5) and stretches. {@link Awaiting} adds the one {@code clientSecret} for the
 * {@code 202} under Stripe (confirmation arrives per stretch by the verified webhook, invariant #8).
 */
record StayView(String code, String status, long venueId, String venueName, String firstDate, String lastDate,
		MoneyView total, List<StretchView> stretches, boolean emailWithheld) {

	record StretchView(long setId, String rowLabel, int positionNo, String firstDate, String lastDate,
			MoneyView amount) {
	}

	record Awaiting(@JsonUnwrapped StayView stay, String clientSecret, String paymentIntentId) {
	}

	/** A stay request's {@code 202}: status {@code PENDING_REQUEST} and the venue's deadline, no payment credential. */
	record Requested(@JsonUnwrapped StayView stay, java.time.Instant requestExpiresAt) {
	}

	static StayView of(StayConfirmation confirmation) {
		return new StayView(confirmation.code(), confirmation.status().name(), confirmation.venueId().value(),
				confirmation.venueName(), confirmation.stay().firstDay().toString(),
				confirmation.stay().lastDay().toString(), confirmation.total(),
				confirmation.stretches().stream().map(StayView::stretchOf).toList(), confirmation.emailWithheld());
	}

	private static StretchView stretchOf(StayConfirmation.Stretch stretch) {
		return new StretchView(stretch.setId().value(), stretch.rowLabel(), stretch.positionNo(),
				stretch.firstDay().toString(), stretch.lastDay().toString(), stretch.amount());
	}
}
