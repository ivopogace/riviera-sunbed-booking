package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

/**
 * The {@code 200} body of a venue day refund: {@code kind} {@code DAY_REFUNDED} (a stay's day, the stay going
 * on) or {@code BOOKING_CANCELLED} (a lone one-day booking cancelled whole), the {@code serviceDate} (ISO
 * {@code YYYY-MM-DD}, #6), the server-decided refund in integer minor units + ISO currency (#5, #10) and
 * whether the day's claim was {@code released}. Never the booking code (#7).
 */
record VenueDayRefundView(String kind, String serviceDate, long refundMinor, String currency, boolean released) {

	static VenueDayRefundView dayRefunded(LocalDate day, long refundMinor, String currency, boolean released) {
		return new VenueDayRefundView("DAY_REFUNDED", day.toString(), refundMinor, currency, released);
	}

	static VenueDayRefundView bookingCancelled(LocalDate day, long refundMinor, String currency) {
		return new VenueDayRefundView("BOOKING_CANCELLED", day.toString(), refundMinor, currency, true);
	}
}
