/**
 * Published <strong>ports</strong> surface of the {@code booking} module (invariant #11, issue
 * #95) — "call-me" interfaces only ({@link DailyTakings}); the published typed ids and value
 * records live in the sibling {@code vocabulary} named interface, published events in
 * {@code events}. Exposed as a Spring Modulith named interface so a sibling (today {@code payout},
 * which reads a venue's daily gross online takings to build the console "takings today" figure)
 * may depend on it without reaching into booking's {@code application.*}/{@code adapter.*}
 * packages. Granted as {@code booking::api} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
