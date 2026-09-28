package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * What a refunded day's mail renders (issue #1210): the booking's code — a stay's for a stretch — (a
 * bearer credential, invariant #7: mailed, never logged), the venue, the washed-out {@code serviceDate}
 * ({@code Europe/Tirane}, #6), the day's refund in minor units + ISO currency (#5) and the code-gated
 * link. The booking goes on for its other days. Public for its adapters.
 */
public record DayRefundMail(String bookingCode, String venueName, LocalDate serviceDate, long refundMinor,
		String currency, URI bookingLink) {
}
