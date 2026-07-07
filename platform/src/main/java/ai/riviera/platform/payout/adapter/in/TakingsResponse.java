package ai.riviera.platform.payout.adapter.in;

import java.time.LocalDate;

import ai.riviera.platform.payout.application.DailyTakingsView;

/**
 * Wire shape of the operator console's takings tile (#171, O2): {@code gross} and {@code net} as
 * money ({@code minorUnits} + ISO {@code currency}, invariant #5 — the FE renders them, never
 * computes them), plus the {@code commissionBps} for the "after {pct} commission" label and the
 * {@code date} the figure is for. Mirrors the frontend {@code MoneyView} shape.
 */
record TakingsResponse(MoneyView gross, MoneyView net, int commissionBps, LocalDate date) {

	static TakingsResponse of(DailyTakingsView v) {
		return new TakingsResponse(new MoneyView(v.grossMinor(), v.currency()),
				new MoneyView(v.netMinor(), v.currency()), v.commissionBps(), v.date());
	}

	record MoneyView(long minorUnits, String currency) {
	}
}
