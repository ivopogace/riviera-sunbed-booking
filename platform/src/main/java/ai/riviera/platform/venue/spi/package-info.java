/**
 * <strong>Driven (service-provider) surface</strong> of the {@code venue} module (invariant
 * #11) — interfaces venue <em>needs another module to implement</em>, as opposed to
 * {@code venue.api}, which holds the inbound ports other modules <em>call</em>.
 *
 * <p>This is the cross-module form of dependency inversion: a driven port whose adapter lives
 * in a sibling module is promoted to its own named interface so the implementor can depend on
 * it without reaching into venue's internals — and so the boundary stays acyclic. (A driven
 * port implemented by venue's <em>own</em> adapter would stay internal in
 * {@code application}, not here.)
 *
 * <p>Holds {@link SetAvailabilityLookup}, implemented by the {@code availability} module so the
 * venue beach-map read can overlay live per-{@code (set, date)} availability, and
 * {@link BookingPresence}, implemented by the {@code booking} module so the bulk layout replace can
 * refuse a venue that has bookings — both without venue depending on those modules.
 * Grant {@code venue::spi} only to the implementing module; callers that merely use venue use
 * {@code venue::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.venue.spi;
