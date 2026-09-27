package ai.riviera.platform.notification.application;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * What a stitched stay's one confirmation email renders: the stay's {@code bookingCode} (a bearer
 * credential, invariant #7; never a stretch's row code), its span, each stop in day order and the total
 * in minor units + ISO currency (#5). Days are inclusive {@code Europe/Tirane} service days (#6). The
 * birth window is rendered as {@link BookingConfirmationMail}'s. Rules: {@code RESPONSIBILITIES.md}
 * §notification.
 */
public record StayConfirmationMail(String bookingCode, String venueName, LocalDate firstDate,
		LocalDate lastDate, List<Stop> stops, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {

	public StayConfirmationMail {
		stops = List.copyOf(stops);
	}

	/** One stretch: its days and its spot. */
	public record Stop(LocalDate firstDate, LocalDate lastDate, String rowLabel, int positionNo) {
	}
}
