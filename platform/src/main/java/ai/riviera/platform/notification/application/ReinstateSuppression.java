package ai.riviera.platform.notification.application;

/**
 * Lift the suppression on an address — the driving port behind the platform-admin reinstatement
 * surface (#391). Takes a <strong>raw</strong> address like every other caller of the suppression
 * list: normalization and the peppered hash happen once, at the adapter chokepoint, so no caller
 * ever handles a key (ADR-0012).
 *
 * <p>Separate from {@link EmailSuppressions} on purpose, despite the near-identical signature: this
 * is the <em>driving</em> side (what a use case offers the outside), while {@code EmailSuppressions}
 * is the <em>driven</em> repository port the adapter implements. The service between them supplies
 * the clock instant (invariant #6) and leaves the audit record, neither of which belongs in a
 * driving adapter.
 *
 * <p>Module-internal — the sole consumer is this module's own {@code adapter/in}, so it is not
 * published as {@code notification::api} (invariant #11; the module still publishes exactly one
 * surface, {@code MailSender}).
 */
public interface ReinstateSuppression {

	/**
	 * Lift the suppression on this address, reporting what was found. Idempotent: a repeat call
	 * reports the original lift rather than moving it. Nothing is written when the address is not on
	 * the list.
	 */
	ReinstateOutcome reinstate(String email);
}
