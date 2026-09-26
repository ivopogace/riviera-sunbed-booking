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
 * Admin commission-rate use cases behind {@link VenueCommissionAdministration} (#11). A change is
 * three writes in one transaction, in this order: pin the superseded rate at the schedule's floor
 * while the live column still holds it; move the live rate; schedule the new rate from the current
 * service date, since today still sells (#4). Forward-only: no past date reprices, no ledger entry
 * is touched (#9). No ownership check: the {@code ADMIN} role gate is the whole authorization, and
 * the edge's {@code /api/admin/**} audit covers it. Rationale: {@code RESPONSIBILITIES.md} §venue.
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
				rates.schedule(venueId, currentServiceDate(), command.commissionBps()));
		return updated;
	}

	private LocalDate currentServiceDate() {
		return LocalDate.ofInstant(clock.instant(), TIRANE);
	}
}
