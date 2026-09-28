package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.DayAttendance;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view (also the {@code Bookings} read-port row): which {@code set} the
 * booking holds on the day, its {@code code} that staff verify on arrival, its stay outcome
 * {@code status} ({@code CONFIRMED} | {@code COMPLETED} | {@code NO_SHOW}), the guest's whole span
 * ({@code firstDate..lastDate} — a stitched stay's, not the stretch's) and the day's own
 * {@code attendance} (a day refunded for weather reads {@code REFUNDED}). The {@code code} is a bearer credential (invariant #7): it travels to the
 * operator-gated endpoint by design but is <strong>never logged</strong> in clear.
 */
public record DailyBooking(SetId setId, String code, BookingStatus status, LocalDate firstDate,
		LocalDate lastDate, DayAttendance attendance) {
}
