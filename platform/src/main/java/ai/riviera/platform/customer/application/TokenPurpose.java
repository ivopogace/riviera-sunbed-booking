package ai.riviera.platform.customer.application;

/**
 * The purpose of a customer account recovery token — the {@code purpose} discriminator on
 * {@code customer_account_token}, kept in lockstep with the migration's {@code CHECK} constraint
 * (invariant #6a). Module-internal (not a published surface): the {@code api} port exposes
 * purpose-specific methods, never this enum, so it stays an implementation detail of the token store.
 */
public enum TokenPurpose {
	VERIFY_EMAIL,
	RESET_PASSWORD
}
