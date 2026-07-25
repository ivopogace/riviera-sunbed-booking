/**
 * <strong>Driven (service-provider) surface</strong> of the {@code customer} module (invariant #11) —
 * interfaces customer <em>needs another module to implement</em>, as opposed to {@code customer.api},
 * which holds the inbound ports other modules <em>call</em>.
 *
 * <p>This is the cross-module form of dependency inversion: a driven port whose adapter lives in a
 * sibling module is promoted to its own named interface so the implementor can depend on it without
 * reaching into customer's internals — and so the boundary stays acyclic. (A driven port implemented
 * by customer's <em>own</em> adapter would stay internal in {@code application}, not here.)
 *
 * <p>Holds {@link GuestBookingHistory}, implemented by the {@code booking} module so the retention sweep
 * (#101 Slice 2) can ask "does this guest still have a recent booking?" without customer depending on
 * booking — which would cycle, since {@code booking} already depends on {@code customer::api}. Same shape
 * as {@code venue.spi.BookingPresence}. Grant {@code customer::spi} only to the implementing module;
 * callers that merely use customer use {@code customer::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.customer.spi;
