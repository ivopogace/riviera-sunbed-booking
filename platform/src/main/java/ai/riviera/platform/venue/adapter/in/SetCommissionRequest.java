package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.CommissionRateCommand;

/**
 * The {@code PUT /api/admin/venues/{venueId}/commission} body; {@link #toCommand()} maps it onto
 * {@link CommissionRateCommand} (0..10000 bps). No bean validation: the controller runs it through
 * {@code InvalidApiRequestException.parsing}, so a bad value is {@code 400 INVALID_REQUEST}, not a
 * 500. {@code Integer}, not {@code int}: a missing field must not read as {@code 0}, a legitimate
 * rate. No effective date (computed server-side, forward-only, so no backdating — invariant #9) and
 * no version token (the admin sets the scalar outright). Rationale: RESPONSIBILITIES.md §venue.
 */
record SetCommissionRequest(Integer commissionBps) {

	CommissionRateCommand toCommand() {
		if (commissionBps == null) {
			throw new IllegalArgumentException("commissionBps is required");
		}
		return new CommissionRateCommand(commissionBps);
	}
}
