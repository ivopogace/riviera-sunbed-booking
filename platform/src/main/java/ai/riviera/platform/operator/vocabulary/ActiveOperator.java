package ai.riviera.platform.operator.vocabulary;

/**
 * An operator the platform admin may act on — i.e. one whose status is {@code ACTIVE} (#128). The
 * read behind the admin console's active-operators list, the counterpart of {@link PendingOperator}
 * for the approval queue.
 *
 * <p>{@code contactEmail} is nullable: an operator provisioned directly (the bootstrap admin, and
 * anything created through {@code OperatorProvisioning#provision}) has no self-registration contact
 * address. {@code admin} surfaces the platform-admin flag so the console can mark those rows — the
 * self-suspend refusal itself is enforced server-side (#128 AC-5), never by hiding a button.
 */
public record ActiveOperator(OperatorId id, String username, String contactEmail, boolean admin) {
}
