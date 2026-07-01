package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Everything the booking-view screen shows (U6): the booking summary (code, {@code status}, venue +
 * set display, date, the gross {@code amount} paid) plus the <strong>server-computed</strong>
 * cancellation terms (invariant #10) — whether it is still {@code cancellable} ({@code CONFIRMED}),
 * whether free cancellation is still open ({@code beforeCutoff}), the {@code refundIfCancelledNow},
 * and, once cancelled, the {@code refundedAmount} actually issued ({@code null} otherwise). Money is
 * integer minor units (invariant #5). A pure value carried out of the use case.
 */
public record BookingDetail(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, MoneyView amount, boolean cancellable,
		boolean beforeCutoff, MoneyView refundIfCancelledNow, MoneyView refundedAmount) {
}
