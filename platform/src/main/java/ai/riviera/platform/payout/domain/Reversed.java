package ai.riviera.platform.payout.domain;

/**
 * What a booking's earlier reversals (whole and per day) have already taken back from its accrual, as
 * summed gross and commission magnitudes (invariant #5). The next reversal reads it so that the one
 * which exhausts the accrual returns exactly the commission still held, never a rounding cent more or
 * less.
 */
public record Reversed(long grossMinor, long commissionMinor) {

	public static final Reversed NONE = new Reversed(0L, 0L);

	public Reversed {
		if (grossMinor < 0 || commissionMinor < 0) {
			throw new IllegalArgumentException("reversed amounts must be non-negative (minor units)");
		}
	}
}
