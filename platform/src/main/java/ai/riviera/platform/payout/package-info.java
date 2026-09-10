/**
 * The payout module — the venue payout ledger (booking amounts − commission)
 * and manual BKT batch reporting (invariant #9: a booking contributes exactly once;
 * refunds reverse it). {@code PayoutLedgerEntry} and {@code PayoutBatch} are immutable value
 * records over the two ledger tables — the entry with {@code accrual}/{@code reversalOf}
 * factories, the batch built through its canonical constructor — not mutable roots.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code application},
 * {@code domain}, {@code adapter.in/out}. Publishes nothing — no {@code api}/{@code spi} of its own;
 * it consumes {@code booking}/{@code venue} events and query ports (incl. {@code booking::api} for the
 * console's daily-takings read), re-reads {@code venue}'s commission rate, and <em>implements</em>
 * {@code booking.spi.VenueChangeFeeRate} so the remodel preview can quote the fee this module decides.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    /**
     * U5: payout reacts to booking::events (BookingConfirmed/BookingCancelled) and re-reads the commission rate
     * from venue::api at accrual time (invariant #11). booking::api: the console daily-takings read
     * pulls a venue's gross confirmed-online takings synchronously. booking::spi: payout implements
     * booking.spi.VenueChangeFeeRate — the inverted, acyclic edge that lets the remodel preview quote a
     * fee payout decides, since a booking -> payout call would cycle. operator::api: both reads assert
     * per-venue ownership (invariant #13). Deny-by-default: each provider granted per surface at least
     * privilege — api+events+spi+vocabulary from booking, api+vocabulary from venue and operator.
     */
    allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary", "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.payout;
