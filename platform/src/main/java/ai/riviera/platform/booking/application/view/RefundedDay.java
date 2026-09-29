package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;

/**
 * One service day of a booking refunded while it went on: the day, what came back (minor units, #5), why
 * ({@code WEATHER}, ADR-0026, or {@code VENUE}, ADR-0027) and whether the day's claim was released.
 */
public record RefundedDay(LocalDate day, long refundMinor, String currency, RefundReason reason, boolean released) {
}
