package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

/** One service day of a booking refunded for weather (issue #1210): the day and what came back (minor units, #5). */
public record RefundedDay(LocalDate day, long refundMinor, String currency) {
}
