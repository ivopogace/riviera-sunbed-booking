package ai.riviera.platform.payment.api;

/**
 * Whether the wired gateway <strong>proves money was collected</strong> before a booking may reach
 * {@code CONFIRMED}: yes under the {@code stripe} profile, where only the signature-verified webhook
 * confirms (invariant #8); no under the default-profile stub, which confirms having collected nothing.
 * The withheld-confirmation-mail flag is disclosed only on {@code true}, or it becomes a free
 * suppression oracle; ask this port, never a profile string. Rationale:
 * {@code RESPONSIBILITIES.md} §booking (the gate) and §payment (why a port of its own).
 */
public interface CollectionGuarantee {

	/** Whether reaching {@code CONFIRMED} implies this deployment's gateway actually collected. */
	boolean provenBeforeConfirmation();
}
