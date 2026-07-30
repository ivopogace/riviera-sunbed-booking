/**
 * Published <strong>ports</strong> surface of the {@code booking} module (invariant #11, issue
 * #95) — "call-me" interfaces only ({@link DailyTakings}, {@link BookingNotificationFacts}); the
 * published typed ids and value records live in the sibling {@code vocabulary} named interface,
 * published events in {@code events}. Exposed as a Spring Modulith named interface so a consumer
 * may depend on it without reaching into booking's {@code application.*}/{@code adapter.*}
 * packages. Granted as {@code booking::api} per least privilege.
 *
 * <p>The three ports are split by <strong>consumer role</strong> (the issue #94 precedent), not piled
 * onto one interface: {@code payout} reads a venue's daily gross online takings for the console
 * "takings today" figure; {@code notification} reads a single booking's facts to compose its
 * confirmation email (#371, widened in #380 for the admin resend, which has no event payload to read
 * them from); and since #380 the same module asks which bookings one guest contact has, to find the
 * booking a support call is about. No caller sees another's methods.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
