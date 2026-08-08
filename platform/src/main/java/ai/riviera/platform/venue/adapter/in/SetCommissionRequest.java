package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.CommissionRateCommand;

/**
 * The {@code PUT /api/admin/venues/{venueId}/commission} request body. A transport DTO
 * of one wire primitive; {@link #toCommand()} maps it onto the typed {@link CommissionRateCommand},
 * whose compact constructor enforces the 0..10000 basis-point range. The project has no
 * {@code spring-boot-starter-validation}, so presence is checked explicitly here and the
 * controller runs the conversion through {@code InvalidApiRequestException.parsing} so a bad value is a
 * {@code 400 INVALID_REQUEST} rather than a logged 500.
 *
 * <p>{@code Integer} rather than {@code int} on purpose: an absent field must be distinguishable from
 * an explicit {@code 0}, which is a legitimate rate (a venue the platform takes nothing from). A
 * primitive would silently read a missing field as zero commission.
 *
 * <p>It carries <strong>no effective date</strong>: the schedule is forward-only and the date is
 * computed server-side, so a request cannot backdate a rate (invariant #9). Nor does it carry a
 * version token — a rate is a scalar the admin sets outright, not a loaded form that could be stale.
 */
record SetCommissionRequest(Integer commissionBps) {

	CommissionRateCommand toCommand() {
		if (commissionBps == null) {
			throw new IllegalArgumentException("commissionBps is required");
		}
		return new CommissionRateCommand(commissionBps);
	}
}
