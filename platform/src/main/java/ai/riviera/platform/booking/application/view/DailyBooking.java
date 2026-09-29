package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.DayAttendance;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view (also the {@code Bookings} read-port row): the {@code set} held on the day,
 * the {@code code} staff verify on arrival, the stay outcome {@code status} ({@code CONFIRMED} | {@code COMPLETED}
 * | {@code NO_SHOW}), the guest's whole span (a stitched stay's, not the stretch's), the day's own
 * {@code attendance} and whether the day was {@code released} (ADR-0027: the set may hold another guest that day).
 * The {@code code} is a bearer credential (#7): it travels to the operator-gated endpoint, never a log.
 */
public record DailyBooking(SetId setId, String code, BookingStatus status, LocalDate firstDate,
		LocalDate lastDate, DayAttendance attendance, boolean released) {
}
