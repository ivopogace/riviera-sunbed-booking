package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin commission-rate use cases (A7, epic #348). Package-private — the public seam is
 * the {@link VenueCommissionAdministration} port (invariant #11).
 *
 * <p><strong>A rate change is three writes in one transaction, and the order carries the
 * invariant.</strong> First it pins the rate being superseded at the schedule's floor — which must
 * happen while the live column still holds it — so every service date up to the change keeps the rate
 * it was sold at. Then it overwrites the live rate, which is what {@code VenueRates#commissionBps}
 * answers and therefore what the next accrual applies. Then it schedules the new rate from the next
 * service date, which is what {@code VenueRates#commissionBpsOn} answers and therefore how the console
 * splits a day's takings. The last two carry the same value and differ only in which dates it governs;
 * one {@code @Transactional} boundary means they cannot be left disagreeing.
 *
 * <p><strong>Why the schedule starts tomorrow.</strong> Invariant #4 closes a service day's bookings
 * the evening before, so every booking for today has already accrued at the old rate; scheduling the
 * new rate from today would guarantee the takings strip disagreed with the ledger for a full day.
 * Tomorrow is the earliest date whose bookings can still be confirmed after the change. Dates already
 * past keep the rate they were sold at — that is the invariant-#9 half of the change, and it is
 * structural: nothing here writes a past schedule row or touches a ledger entry.
 *
 * <p>There is <strong>no ownership check</strong> and that is the design (see the port): an admin owns
 * no venue, so the {@code ADMIN} role gate in {@code SecurityConfig} is the whole authorization. The
 * audit trail is the platform-wide {@code /api/admin/**} record (#507) — no instrumentation here.
 */
@Service
class VenueCommissionService implements VenueCommissionAdministration {

	/** Invariant #6: a service date is a civil date in this zone, never the JVM default. */
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final CommissionRateStore rates;
	private final Clock clock;

	VenueCommissionService(CommissionRateStore rates, Clock clock) {
		this.rates = rates;
		this.clock = clock;
	}

	@Override
	public List<VenueCommissionView> venueCommissions() {
		return rates.findAll();
	}

	@Override
	@Transactional
	public Optional<VenueCommissionView> setCommission(VenueId venueId, CommissionRateCommand command) {
		// Before the live column moves, while it still holds the rate being superseded.
		rates.ensureFloorRate(venueId);
		Optional<VenueCommissionView> updated = rates.updateLiveRate(venueId, command.commissionBps());
		// Schedule only once the live write proved the venue exists, so a 404 leaves no orphan row.
		updated.ifPresent(venue ->
				rates.schedule(venueId, nextServiceDate(), command.commissionBps()));
		return updated;
	}

	private LocalDate nextServiceDate() {
		return LocalDate.ofInstant(clock.instant(), TIRANE).plusDays(1);
	}
}
