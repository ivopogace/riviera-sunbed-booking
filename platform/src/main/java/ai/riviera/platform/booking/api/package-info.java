/**
 * Published <strong>ports</strong> surface of the {@code booking} module (invariant #11, issue
 * #95) — "call-me" interfaces only ({@link DailyTakings}, {@link BookingNotificationFacts}); the
 * published typed ids and value records live in the sibling {@code vocabulary} named interface,
 * published events in {@code events}. Exposed as a Spring Modulith named interface so a consumer
 * may depend on it without reaching into booking's {@code application.*}/{@code adapter.*}
 * packages. Granted as {@code booking::api} per least privilege.
 *
 * <p>The two ports are split by <strong>consumer role</strong> (the issue #94 precedent), not piled
 * onto one interface: {@code payout} reads a venue's daily gross online takings for the console
 * "takings today" figure, while the platform edge reads a single booking's arrival code + contact id
 * to compose the confirmation email (#371). Neither caller sees the other's methods.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
