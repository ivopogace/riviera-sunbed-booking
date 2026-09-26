package ai.riviera.platform.venue.application;

/**
 * The validated intent to set a venue's commission rate. The compact constructor enforces the
 * 0..10000 range through {@link VenueFieldValidation#requireCommissionBps}, shared with onboarding
 * so the two cannot drift; the {@code venue_commission_bps_check} and
 * {@code venue_commission_rate_bps_check} CHECKs are the race-safe backstop. Exact
 * basis points (1500 = 15.00%, invariant #5), never a float or a percent. No effective date: the
 * service schedules from the current service date, so no request reprices history (invariant #9).
 */
public record CommissionRateCommand(int commissionBps) {

	public CommissionRateCommand {
		VenueFieldValidation.requireCommissionBps(commissionBps);
	}
}
