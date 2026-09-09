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
 * venue's dated reads — the beach map, the owner's daily view and the tourist availability calendar — can overlay live per-{@code (set, date)} availability,
 * {@link BookingPresence}, implemented by the {@code booking} module so the layout writes can refuse
 * a set someone is still owed, the owner's beach-map read can pin it and the close-for-season
 * response can count what guests are still owed, and {@link SalesWindow}, implemented by the
 * {@code booking} module so the tourist catalogue reads can carry the open/closed sales verdict —
 * the on-day sales close and the season closure — without venue re-deriving either rule — all
 * without venue depending on those modules.
 * Grant {@code venue::spi} only to the implementing module; callers that merely use venue use
 * {@code venue::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.venue.spi;
