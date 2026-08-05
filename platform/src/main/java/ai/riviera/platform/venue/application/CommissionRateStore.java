package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Outbound (driven) port: commission-rate storage (A7, epic #348) — the venue's <strong>live</strong>
 * rate and its <strong>effective-dated schedule</strong>, plus the platform-wide read the admin list
 * needs. Internal to the module, implemented by the module's own {@code adapter.out} JDBC adapter, so
 * it is not published in {@code api/} (invariant #11).
 *
 * <p><strong>Why not three more methods on {@link Venues}.</strong> {@code Venues} is already the
 * broad venue write store, and the rate is a different conversation with a different actor: the
 * platform admin setting a commercial term, not an owner editing their venue. Keeping it apart is the
 * same least-privilege split the published {@code venue::api} surface made by consumer role (#94) —
 * and it means a caller that only administers rates cannot reach the beach-map writes.
 *
 * <p><strong>A rate change is three writes.</strong> {@link #ensureFloorRate} pins the rate being
 * superseded so past dates keep it; {@link #updateLiveRate} sets the rate every <em>decision</em>
 * from now on uses (an accrual, a refund computation); {@link #schedule} records which <em>service
 * dates</em> the new rate governs for reporting. The last two carry the same bps and differ only in
 * the dates they answer for. Nothing here rewrites a past schedule row or a ledger entry — the
 * schedule is forward-only, so history is never repriced (invariant #9).
 */
public interface CommissionRateStore {

	/**
	 * Pin the venue's <strong>current</strong> rate at the schedule's epoch floor, unless the venue
	 * already has a floor row — in which case this does nothing. Called <em>first</em> in a rate
	 * change, while {@code venue.commission_bps} still holds the rate being superseded, so that rate
	 * becomes the answer for every service date up to the change. A venue that has never changed rate
	 * has no rows at all, which the per-date read answers from the live column.
	 *
	 * <p><strong>This is what makes the per-date read total, and it lives here rather than at venue
	 * creation on purpose.</strong> Seeding on create would make the guarantee depend on every insert
	 * path cooperating, and they do not — the ITs insert venues with raw SQL, and nothing stops a
	 * future import or a manual fix from doing the same. Pinning when the rate first changes needs no
	 * cooperation from whoever created the venue: coverage appears exactly when it starts to matter.
	 *
	 * <p>A no-op for an unknown venue (it reads the rate from the venue row, and there is none), so a
	 * failed write leaves no orphan schedule row behind.
	 */
	void ensureFloorRate(VenueId venueId);

	/**
	 * Record that {@code commissionBps} applies to the venue's bookings served on or after
	 * {@code effectiveFrom} — a civil date in {@code Europe/Tirane} (invariant #6). Idempotent per
	 * {@code (venue, effectiveFrom)}: a second write for the same date overwrites the rate rather than
	 * erroring or duplicating, so two admins acting on the same day collapse onto one row carrying the
	 * last value.
	 *
	 * <p>Called only with a date the service computed, never one a request supplied — and only after
	 * {@link #ensureFloorRate}, or the dates before {@code effectiveFrom} would have no answer.
	 */
	void schedule(VenueId venueId, LocalDate effectiveFrom, int commissionBps);

	/**
	 * Overwrite the venue's live commission rate — the column {@code VenueRates#commissionBps} reads at
	 * decision time — and return the venue as it now stands, or empty if no venue has this id, in which
	 * case the caller reports not-found and schedules nothing. One statement
	 * ({@code UPDATE … RETURNING}) rather than a write plus a re-read, so the returned view cannot
	 * describe a row another writer changed in between.
	 *
	 * <p>Deliberately unconditional otherwise: unlike the venue profile write there is no
	 * optimistic-concurrency token, because a rate is a single scalar an admin sets outright rather
	 * than a loaded form that could be stale. Two admins racing therefore resolve last-writer-wins,
	 * which is the honest outcome for "the commission is now X".
	 */
	Optional<VenueCommissionView> updateLiveRate(VenueId venueId, int commissionBps);

	/**
	 * Every venue with its live commission rate and payout currency, <strong>ordered by name then
	 * id</strong> — the platform-admin read model. Deliberately platform-wide: no ownership filter and
	 * no id set, which is why only an ADMIN-gated caller may reach it (invariant #13's
	 * {@code /api/admin/**} exemption). Contrast {@code Venues#findSummaries}, whose ids the caller has
	 * already reduced to what one operator owns.
	 */
	List<VenueCommissionView> findAll();
}
