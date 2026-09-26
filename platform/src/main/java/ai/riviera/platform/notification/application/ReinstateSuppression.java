package ai.riviera.platform.notification.application;

/**
 * Lift the suppression on an address — the driving port behind the admin reinstatement surface.
 * Takes a <strong>raw</strong> address: normalization and the peppered hash happen once, at the
 * adapter chokepoint, so no caller ever handles a key (ADR-0012). The driving twin of the driven
 * {@link EmailSuppressions}; the service between them supplies the clock instant (invariant #6) and
 * the audit record, neither of which belongs in a driving adapter. Module-internal (invariant #11).
 */
public interface ReinstateSuppression {

	/**
	 * Lift the suppression on this address, reporting what was found. Idempotent: a repeat call
	 * reports the original lift rather than moving it. Nothing is written when the address is not on
	 * the list.
	 */
	ReinstateOutcome reinstate(String email);
}
