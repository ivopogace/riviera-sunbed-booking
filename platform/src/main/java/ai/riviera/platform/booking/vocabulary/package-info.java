/**
 * Published <strong>vocabulary</strong> of the {@code booking} module (invariant #11, issue
 * #95) — the {@link BookingId} typed id and the {@link RefundReason} carried by
 * {@code BookingCancelled} (policy vs weather, ADR-0005). Value types only — the module
 * publishes no ports (its command services stay internal in {@code application/}); published
 * events live in the sibling {@code events} named interface. Granted as
 * {@code booking::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.booking.vocabulary;
