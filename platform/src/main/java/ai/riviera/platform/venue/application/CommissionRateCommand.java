package ai.riviera.platform.venue.application;

/**
 * The validated intent to set a venue's commission rate (A7, epic #348). A typed command at the
 * application boundary — the admin REST adapter maps the wire integer onto this, and the compact
 * constructor enforces the 0..10000 basis-point range through the same
 * {@link VenueFieldValidation#requireCommissionBps} the onboarding command uses, so the two cannot
 * drift; the {@code venue_commission_bps_check} / {@code venue_commission_rate_bps_check} CHECKs are
 * the race-safe backstop, not the only guard (invariant #12).
 *
 * <p>{@code commissionBps} is exact-integer basis points (1500 = 15.00%, invariant #5) — never a float
 * and never a percent. Turning a human percent into this integer is the console's job, not the API's.
 *
 * <p>It deliberately carries <strong>no effective date</strong>. The date the rate starts applying to
 * is computed server-side by the service (the next service date in {@code Europe/Tirane}), so the
 * command cannot express a backdated change and no request can reprice history (invariant #9).
 */
public record CommissionRateCommand(int commissionBps) {

	public CommissionRateCommand {
		VenueFieldValidation.requireCommissionBps(commissionBps);
	}
}
