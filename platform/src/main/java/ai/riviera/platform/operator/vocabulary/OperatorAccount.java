package ai.riviera.platform.operator.vocabulary;

/**
 * A decided operator account — one an admin can act on, i.e. {@code ACTIVE} or {@code SUSPENDED}.
 * The read behind the admin console's operator list, the counterpart of {@link PendingOperator}
 * for the approval queue. Both states are in one list deliberately: a suspended operator that vanished
 * from the console would make suspension a one-way door, recoverable only by hand-run SQL.
 *
 * <p>{@code contactEmail} is nullable: an operator provisioned directly (the bootstrap admin, and
 * anything created through {@code OperatorProvisioning#provision}) has no self-registration contact
 * address. {@code admin} surfaces the platform-admin flag so the console can mark those rows — the
 * self-suspend refusal itself is enforced server-side (AC-5), never by hiding a button.
 *
 * <p>The state is published as a {@code suspended} boolean rather than the status token, because
 * {@code OperatorStatus} is module-internal ({@code domain/}) and must not cross the seam.
 */
public record OperatorAccount(OperatorId id, String username, String contactEmail, boolean admin,
		boolean suspended) {
}
