package ai.riviera.platform.customer.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.AccountErasureStore;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * JDBC adapter for the {@code customer} module's {@link AccountErasureStore} port (ADR-0007
 * {@code adapter/out}). Explicit SQL via {@link JdbcClient} in text blocks, named params,
 * package-private (invariant #1, mirroring {@code JdbcCustomerAccounts} / {@code JdbcCustomerDirectory}).
 *
 * <p>Every scrub is an {@code UPDATE … WHERE erased_at IS NULL} (idempotent + tombstone-in-place, never a
 * hard delete of a row a retained booking references) except the transient child rows, which are deleted.
 * The tombstone email is {@code 'erased+' || id || '@erased.invalid'} — deterministic and unique per row
 * (so it never collides with the {@code email} UNIQUE constraint), on the reserved {@code .invalid} TLD
 * (RFC 2606) so it can never route. Name/phone become the fixed {@code 'ERASED'} placeholder.
 */
@Repository
class JdbcAccountErasure implements AccountErasureStore {

	/** SQL named-param keys, named not duplicated (invariant #6a). */
	private static final String ID = "id";
	private static final String EMAIL = "email";
	private static final String ACCOUNT_ID = "accountId";

	private final JdbcClient jdbc;

	JdbcAccountErasure(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<String> emailOfAccount(CustomerAccountId accountId) {
		return jdbc.sql("SELECT email FROM customer_account WHERE id = :id")
				.param(ID, accountId.value())
				.query(String.class)
				.optional();
	}

	@Override
	public boolean eraseAccountById(CustomerAccountId accountId) {
		int updated = jdbc.sql("""
				UPDATE customer_account
				SET email = 'erased+' || id || '@erased.invalid', password_hash = NULL, erased_at = NOW()
				WHERE id = :id AND erased_at IS NULL
				""")
				.param(ID, accountId.value())
				.update();
		if (updated == 0) {
			return false;
		}
		deleteAccountChildren(accountId.value());
		return true;
	}

	@Override
	public boolean eraseAccountByEmail(String normalizedEmail) {
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :email AND erased_at IS NULL")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.map(id -> eraseAccountById(new CustomerAccountId(id)))
				.orElse(false);
	}

	@Override
	public int eraseGuestByEmail(String normalizedEmail) {
		return jdbc.sql("""
				UPDATE customer
				SET email = 'erased+' || id || '@erased.invalid', full_name = 'ERASED', phone = 'ERASED',
				    erased_at = NOW(), updated_at = NOW()
				WHERE email = :email AND erased_at IS NULL
				""")
				.param(EMAIL, normalizedEmail)
				.update();
	}

	/** Delete the account's transient child rows — SSO identities carry a subject/email; tokens are bearer digests. */
	private void deleteAccountChildren(long accountId) {
		jdbc.sql("DELETE FROM customer_sso_identity WHERE account_id = :accountId")
				.param(ACCOUNT_ID, accountId)
				.update();
		jdbc.sql("DELETE FROM customer_account_token WHERE account_id = :accountId")
				.param(ACCOUNT_ID, accountId)
				.update();
	}
}
