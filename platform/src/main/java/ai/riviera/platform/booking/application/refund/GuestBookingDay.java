package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

/**
 * One service day of a guest's booking as the admin's day-refund lookup shows it, read off the
 * {@code booking_day} stamps: {@code OPEN} (neither attended nor refunded, the refund's candidates, a
 * missed day included), {@code ATTENDED}, {@code REFUNDED} (the set still held) or {@code RELEASED}.
 */
public record GuestBookingDay(LocalDate date, State state) {

	public enum State {
		OPEN, ATTENDED, REFUNDED, RELEASED
	}
}
