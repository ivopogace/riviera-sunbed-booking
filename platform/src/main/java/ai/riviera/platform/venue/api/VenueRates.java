package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.OptionalInt;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>rate-configuration</strong> port (invariant #11) — the
 * per-venue basis-point rates, split out by consumer role. Rates are mutable venue configuration read
 * at decision time, never carried on an event. Consumed by {@code payout} (commission accrual + the
 * console daily-takings read) and {@code booking} (late-cancel refund policy).
 *
 * <p><strong>"Read at decision time" is a claim about the writes, not about every read.</strong> It
 * governs every rate a decision consumes — an accrual, a refund computation — and is why no rate is
 * ever copied onto an event. A <em>reporting</em> read is the second question this port answers: one
 * that must reproduce a decision already made on a past date, which the live column cannot do once the
 * rate changes. Hence the pair — the live {@link #commissionBps} for decisions being made now,
 * {@link #commissionBpsOn} for figures describing days already sold.
 */
public interface VenueRates {

	/**
	 * The venue's <strong>current</strong> commission rate in <strong>basis points</strong>
	 * (1500 = 15.00%), or empty if no venue has that id. Read by the {@code payout} module to
	 * compute the commission on a confirmed booking (invariant #9):
	 * {@code commission = floorDiv(gross × bps, 10000)}, integer-exact (invariant #5). It is
	 * deliberately <em>not</em> carried on the {@code BookingConfirmed} event — the rate is mutable
	 * venue configuration, re-read here at accrual time, not a fixed fact of the booking
	 * (invariant #11).
	 *
	 * <p>This is the <strong>decision-time</strong> read and the only one an accrual may use: the
	 * ledger entry it feeds persists the resulting {@code commissionMinor}, which is what makes that
	 * accrual permanent. Do not substitute {@link #commissionBpsOn} here — a booking accrues under
	 * the rate in force when it was confirmed, not one keyed to the day it will be served.
	 */
	OptionalInt commissionBps(VenueId id);

	/**
	 * The commission rate in <strong>basis points</strong> that applies to bookings <em>served on</em>
	 * {@code serviceDate} — the latest rate the venue had scheduled at or before that civil date in
	 * {@code Europe/Tirane} (invariant #6) — or empty if no venue has that id.
	 *
	 * <p>For the <strong>reporting</strong> reads only. Reading {@link #commissionBps} there meant a rate
	 * change silently re-split every <em>past</em> day at the new rate while the payout ledger kept the
	 * commission it had accrued. Invariant #9 says the ledger is right — history is never repriced and
	 * past statements stay as sent — so the view needs the rate that applied on that date. Rate writes
	 * are forward-only, so a date already past always answers the same value.
	 *
	 * <p>Always resolves for a venue that exists; empty means "no such venue", never "no rate scheduled
	 * yet". A venue whose rate has never changed has no schedule and answers from its live rate, which
	 * is exactly what applied; from its first change onward the change pins the superseded rate back to
	 * an epoch floor, so every date it could have sold on is covered. It is <strong>not</strong> exact
	 * agreement with the ledger and does not claim to be — the ledger's commission is per booking at
	 * accrual, this is one rate per day, so a booking confirmed before a change but served after it
	 * accrued at the old rate while this answers the new one. What it guarantees is that a past date's
	 * figure never changes.
	 */
	OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate);

	/**
	 * The venue's <strong>after-cutoff</strong> refund share in <strong>basis points</strong>
	 * (5000 = 50.00%, 0 = non-refundable, 10000 = full), or empty if no venue has that id. Read by
	 * the {@code booking} module to compute a late cancellation's refund server-side (invariant
	 * #10): {@code refund = floorDiv(gross × bps, 10000)}, integer-exact (invariant #5). Cancelling
	 * <em>before</em> the cutoff is always a full refund and does not consult this rate. Like
	 * {@link #commissionBps}, it is mutable venue configuration read at decision time, never carried
	 * on an event.
	 */
	OptionalInt lateCancelRefundBps(VenueId id);
}
