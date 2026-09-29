package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;

/**
 * What a refunded day's mail renders: the booking's code — a stay's for a stretch — (a bearer credential,
 * invariant #7: mailed, never logged), the venue, the {@code serviceDate} ({@code Europe/Tirane}, #6), the
 * day's refund in minor units + ISO currency (#5), why ({@code WEATHER}: the venue closed, the spot stays
 * the guest's; {@code VENUE}: the venue refunded it, no grounds given, ADR-0027 §9), whether the spot is
 * {@code released} and the code-gated link. The booking goes on for its other days. Public for its adapters.
 */
public record DayRefundMail(String bookingCode, String venueName, LocalDate serviceDate, long refundMinor,
		String currency, RefundReason reason, boolean released, URI bookingLink) {
}
