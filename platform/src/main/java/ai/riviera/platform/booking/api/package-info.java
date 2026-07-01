/**
 * The {@code booking} module's published surface (invariant #11) — the only package other
 * modules may import. Holds the technical {@code BookingId} and the published domain-event
 * records (U5: {@link ai.riviera.platform.booking.api.BookingConfirmed}). Internal use-case
 * ports stay in {@code booking.application} (sliced by use-case); this {@code api/} is the
 * cross-module contract.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
