/**
 * Published ports of the {@code booking} module (invariant #11), granted as {@code booking::api}:
 * "call-me" interfaces only; typed ids and value records live in {@code vocabulary}, events in
 * {@code events}. The ports are split by consumer role, so no caller sees another's methods:
 * {@link DailyTakings} ({@code payout}'s takings figure), {@link BookingNotificationFacts} and
 * {@link CustomerBookings} ({@code notification}'s mails, resend and support lookup), and
 * {@link RemodelClaims} (the platform edge's remodel preview and commit, ADR-0020, ADR-0021).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
