package ai.riviera.platform.operator.vocabulary;

/**
 * A decided operator account ({@code ACTIVE} or {@code SUSPENDED}) for the admin console's list,
 * counterpart of {@link PendingOperator}; both states share it so suspension stays reversible from
 * the console. {@code contactEmail} is null for a directly provisioned operator (the bootstrap
 * admin, anything from {@code OperatorProvisioning#provision}). {@code admin} lets the console mark
 * admin rows; the self-suspend refusal is enforced server-side, never by hiding a button.
 * {@code suspended} is a boolean because the list only ever holds decided accounts.
 */
public record OperatorAccount(OperatorId id, String username, String contactEmail, boolean admin,
		boolean suspended) {
}
