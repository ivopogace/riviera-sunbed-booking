package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.view.DailyBooking;

/**
 * JSON view of one staff-daily-view row: the {@code setId} the booking holds on the day, its
 * {@code code}, its stay outcome {@code status} ({@code CONFIRMED} | {@code COMPLETED} |
 * {@code NO_SHOW}), the guest's span as ISO {@code YYYY-MM-DD} (invariant #6) and the day's
 * {@code attendance} ({@code EXPECTED} | {@code ATTENDED} | {@code MISSED} | {@code REFUNDED}) and whether a
 * refunded day was {@code released} (ADR-0027). The code is the bearer credential staff verify on
 * arrival (invariant #7) — never logged in clear.
 */
record DailyBookingView(long setId, String code, String status, String firstDate, String lastDate,
		String attendance, boolean released) {

	static DailyBookingView of(DailyBooking b) {
		return new DailyBookingView(b.setId().value(), b.code(), b.status().name(),
				b.firstDate().toString(), b.lastDate().toString(), b.attendance().name(), b.released());
	}
}
