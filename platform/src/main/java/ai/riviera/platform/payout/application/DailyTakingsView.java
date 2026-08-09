package ai.riviera.platform.payout.application;

import java.time.LocalDate;

/**
 * A venue's online takings for one service date: {@code grossMinor} (Σ the kept-money online booking
 * amounts) split into {@code commissionMinor} + {@code netMinor} at the venue's {@code commissionBps}
 * rate, all integer minor units + ISO {@code currency} (invariant #5). {@code date} is the service
 * date reasoned in {@code Europe/Tirane} (invariant #6). Indicative — not the payout ledger.
 */
public record DailyTakingsView(long grossMinor, long commissionMinor, long netMinor,
		int commissionBps, String currency, LocalDate date) {
}
