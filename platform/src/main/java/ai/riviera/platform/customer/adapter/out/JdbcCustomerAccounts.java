package ai.riviera.platform.customer.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.CustomerAccountStore;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * JDBC adapter for the {@code customer} module's {@link CustomerAccountStore} port (ADR-0007
 * {@code adapter/out}). Explicit SQL via {@link JdbcClient} in text blocks, named params,
 * package-private (invariant #1, mirroring {@code JdbcOperators} / {@code JdbcCustomerDirectory}).
 *
 * <p>Registration is one atomic statement: {@code INSERT … ON CONFLICT (email) DO NOTHING RETURNING id}
 * against {@code customer_account_email_uniq}. A row comes back only when THIS statement created it, so
 * the presence/absence of the returned id is the {@link RegistrationOutcome} — and a concurrent
 * duplicate loses the race with zero rows returned (never a second account for the email).
 */
@Repository
class JdbcCustomerAccounts implements CustomerAccountStore {

	/** SQL named-param / column keys, named not duplicated (invariant #6a). */
	private static final String EMAIL = "email";
	private static final String PROVIDER = "provider";
	private static final String SUBJECT = "subject";
	private static final String ACCOUNT_ID = "accountId";
	private static final String ID = "id";

	private final JdbcClient jdbc;

	JdbcCustomerAccounts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<CustomerAccountCredential> findByEmail(String normalizedEmail) {
		// password_hash IS NOT NULL excludes SSO-only accounts (S4 #112): they have no local password, so
		// the edge sees "no credential" and password login returns the generic 401 (non-enumeration D-8).
		return jdbc.sql("""
				SELECT email, password_hash FROM customer_account
				WHERE email = :email AND password_hash IS NOT NULL
				""")
				.param(EMAIL, normalizedEmail)
				.query((rs, rowNum) -> new CustomerAccountCredential(
						rs.getString(EMAIL), rs.getString("password_hash")))
				.optional();
	}

	@Override
	public Optional<CustomerAccountId> findIdByEmail(String normalizedEmail) {
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :email")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.map(CustomerAccountId::new);
	}

	@Override
	public RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash) {
		return jdbc.sql("""
				INSERT INTO customer_account (email, password_hash)
				VALUES (:email, :hash)
				ON CONFLICT (email) DO NOTHING
				RETURNING id
				""")
				.param(EMAIL, normalizedEmail)
				.param("hash", passwordHash)
				.query(Long.class)
				.optional()
				.<RegistrationOutcome>map(id -> new RegistrationOutcome.Registered(new CustomerAccountId(id)))
				.orElseGet(RegistrationOutcome.AlreadyRegistered::new);
	}

	@Override
	public CustomerAccountId resolveSsoAccount(SsoProvider provider, String subject, String normalizedEmail) {
		// 1. A returning (provider, subject) resolves to its already-linked account FIRST — before any
		//    email path — so a changed provider email can never spawn a stray second account.
		Optional<Long> existing = accountIdForIdentity(provider, subject);
		if (existing.isPresent()) {
			return new CustomerAccountId(existing.get());
		}
		// 2. Find-or-create the account by email: claim a new password-less account, or (email taken)
		//    auto-link to the existing one. Race-safe — a concurrent creator wins the ON CONFLICT and we
		//    read back its id.
		long accountId = jdbc.sql("""
				INSERT INTO customer_account (email, password_hash)
				VALUES (:email, NULL)
				ON CONFLICT (email) DO NOTHING
				RETURNING id
				""")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.orElseGet(() -> jdbc.sql("SELECT id FROM customer_account WHERE email = :email")
						.param(EMAIL, normalizedEmail)
						.query(Long.class)
						.single());
		// 3. Link the identity, race-safe: a concurrent first sign-in for the same subject wins the
		//    ON CONFLICT (provider, subject) claim and we read back the winner's account_id.
		long linked = jdbc.sql("""
				INSERT INTO customer_sso_identity (account_id, provider, subject, email)
				VALUES (:accountId, :provider, :subject, :email)
				ON CONFLICT (provider, subject) DO NOTHING
				RETURNING account_id
				""")
				.param(ACCOUNT_ID, accountId)
				.param(PROVIDER, provider.name())
				.param(SUBJECT, subject)
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.orElseGet(() -> accountIdForIdentity(provider, subject).orElseThrow());
		return new CustomerAccountId(linked);
	}

	@Override
	public void markEmailVerified(CustomerAccountId accountId) {
		// Guarded (email_verified = false) so it is idempotent and never churns email_verified_at on a
		// repeat call (e.g. a returning SSO sign-in re-marking an already-verified account).
		jdbc.sql("""
				UPDATE customer_account
				SET email_verified = true, email_verified_at = NOW()
				WHERE id = :id AND email_verified = false
				""")
				.param(ID, accountId.value())
				.update();
	}

	@Override
	public void updatePasswordHash(CustomerAccountId accountId, String passwordHash) {
		jdbc.sql("UPDATE customer_account SET password_hash = :hash WHERE id = :id")
				.param("hash", passwordHash)
				.param(ID, accountId.value())
				.update();
	}

	@Override
	public boolean isEmailVerified(CustomerAccountId accountId) {
		return jdbc.sql("SELECT email_verified FROM customer_account WHERE id = :id")
				.param(ID, accountId.value())
				.query(Boolean.class)
				.optional()
				.orElse(false);
	}

	private Optional<Long> accountIdForIdentity(SsoProvider provider, String subject) {
		return jdbc.sql("""
				SELECT account_id FROM customer_sso_identity WHERE provider = :provider AND subject = :subject
				""")
				.param(PROVIDER, provider.name())
				.param(SUBJECT, subject)
				.query(Long.class)
				.optional();
	}
}
