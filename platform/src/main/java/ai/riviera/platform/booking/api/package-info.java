/**
 * Published <strong>ports</strong> surface of the {@code booking} module (invariant #11) —
 * "call-me" interfaces only ({@link DailyTakings}, {@link BookingNotificationFacts},
 * {@link CustomerBookings}, {@link RemodelClaims}); the
 * published typed ids and value records live in the sibling {@code vocabulary} named interface,
 * published events in {@code events}. Exposed as a Spring Modulith named interface so a consumer
 * may depend on it without reaching into booking's {@code application.*}/{@code adapter.*}
 * packages. Granted as {@code booking::api} per least privilege.
 *
 * <p>The four ports are split by <strong>consumer role</strong>, not piled
 * onto one interface: {@code payout} reads a venue's daily gross online takings for the console
 * "takings today" figure; {@code notification} reads a single booking's facts to compose its
 * confirmation email and to rebuild one for the admin resend, which has no event payload to read
 * them from; the same module asks which bookings one guest contact has, to find the
 * booking a support call is about; and the platform edge asks what a layout remodel would do to the
 * live bookings on the sets it disturbs, composing the answer with {@code venue}'s diff (ADR-0020).
 * No caller sees another's methods.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
