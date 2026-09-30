package ai.riviera.platform.customer.adapter.out;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.CustomerAccountStore;
import ai.riviera.platform.customer.application.SsoAccountClaim;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * JDBC adapter for the {@code customer} module's {@link CustomerAccountStore} port. Explicit SQL
 * via {@link JdbcClient} in text blocks, named params, package-private (invariant #1).
 *
 * <p>Registration is one atomic statement: {@code INSERT … ON CONFLICT (email) DO NOTHING RETURNING id}
 * against {@code customer_account_email_uniq}. A row comes back only when THIS statement created it, so
 * the presence/absence of the returned id is the {@link RegistrationOutcome} — and a concurrent
 * duplicate loses the race with zero rows returned (never a second account for the email).
 */
@Repository
class JdbcCustomerAccounts implements CustomerAccountStore {

	/** SQL named-param / column keys, named not duplicated (conventions §6a). */
	private static final String EMAIL = "email";
	private static final String PROVIDER = "provider";
	private static final String SUBJECT = "subject";
	private static final String ACCOUNT_ID = "accountId";
	private static final String ID = "id";

	private static final String LIVE_CREDENTIAL_SELECT = "SELECT id, email, password_hash FROM customer_account ";

	private final JdbcClient jdbc;

	JdbcCustomerAccounts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<CustomerAccountCredential> findByEmail(String normalizedEmail) {
		// password_hash IS NOT NULL excludes SSO-only accounts: they have no local password, so
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
	public Optional<LiveAccountCredential> findLiveCredential(String normalizedEmail) {
		return jdbc.sql(LIVE_CREDENTIAL_SELECT + "WHERE email = :email AND erased_at IS NULL")
				.param(EMAIL, normalizedEmail)
				.query(JdbcCustomerAccounts::mapLiveCredential)
				.optional();
	}

	@Override
	public Optional<LiveAccountCredential> findLiveCredential(CustomerAccountId accountId) {
		return jdbc.sql(LIVE_CREDENTIAL_SELECT + "WHERE id = :id AND erased_at IS NULL")
				.param(ID, accountId.value())
				.query(JdbcCustomerAccounts::mapLiveCredential)
				.optional();
	}

	private static LiveAccountCredential mapLiveCredential(ResultSet rs, int rowNum) throws SQLException {
		return new LiveAccountCredential(new CustomerAccountId(rs.getLong(ID)), rs.getString(EMAIL),
				rs.getString("password_hash"));
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
	public Optional<CustomerAccountId> accountForSsoIdentity(SsoProvider provider, String subject) {
		return liveAccountIdForIdentity(provider, subject).map(CustomerAccountId::new);
	}

	@Override
	public Optional<SsoAccountClaim> claimAccountForSso(String normalizedEmail) {
		Optional<Long> created = jdbc.sql("""
				INSERT INTO customer_account (email, password_hash)
				VALUES (:email, NULL)
				ON CONFLICT (email) DO NOTHING
				RETURNING id
				""")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional();
		if (created.isPresent()) {
			return Optional.of(new SsoAccountClaim(new CustomerAccountId(created.get()), true));
		}
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :email")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.map(id -> new SsoAccountClaim(new CustomerAccountId(id), false));
	}

	@Override
	public Optional<CustomerAccountId> linkSsoIdentity(CustomerAccountId accountId, SsoProvider provider,
			String subject, String normalizedEmail) {
		Optional<Long> linked = jdbc.sql("""
				INSERT INTO customer_sso_identity AS linked (account_id, provider, subject, email)
				VALUES (:accountId, :provider, :subject, :email)
				ON CONFLICT (provider, subject) DO UPDATE SET account_id = EXCLUDED.account_id, email = EXCLUDED.email
				WHERE EXISTS (SELECT 1 FROM customer_account a
				              WHERE a.id = linked.account_id AND a.erased_at IS NOT NULL)
				RETURNING account_id
				""")
				.param(ACCOUNT_ID, accountId.value())
				.param(PROVIDER, provider.name())
				.param(SUBJECT, subject)
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional();
		return linked.or(() -> liveAccountIdForIdentity(provider, subject)).map(CustomerAccountId::new);
	}

	@Override
	public void deleteUnlinkedAccount(CustomerAccountId accountId) {
		jdbc.sql("DELETE FROM customer_account WHERE id = :id AND password_hash IS NULL")
				.param(ID, accountId.value())
				.update();
	}

	@Override
	public void markEmailVerified(CustomerAccountId accountId) {
		jdbc.sql("""
				UPDATE customer_account
				SET email_verified = true, email_verified_at = NOW()
				WHERE id = :id AND email_verified = false AND erased_at IS NULL
				""")
				.param(ID, accountId.value())
				.update();
	}

	@Override
	public boolean lockLiveAccount(CustomerAccountId accountId) {
		return jdbc.sql("SELECT id FROM customer_account WHERE id = :id AND erased_at IS NULL FOR NO KEY UPDATE")
				.param(ID, accountId.value())
				.query(Long.class)
				.optional()
				.isPresent();
	}

	@Override
	public boolean replacePasswordHash(CustomerAccountId accountId, String expectedHash, String passwordHash) {
		return jdbc.sql("""
				UPDATE customer_account SET password_hash = :hash
				WHERE id = :id AND erased_at IS NULL AND password_hash IS NOT DISTINCT FROM :expected
				""")
				.param("hash", passwordHash)
				.param(ID, accountId.value())
				.param("expected", expectedHash, Types.VARCHAR)
				.update() == 1;
	}

	@Override
	public void updatePasswordHash(CustomerAccountId accountId, String passwordHash) {
		jdbc.sql("UPDATE customer_account SET password_hash = :hash WHERE id = :id AND erased_at IS NULL")
				.param("hash", passwordHash)
				.param(ID, accountId.value())
				.update();
	}

	@Override
	public Optional<Boolean> emailVerifiedFor(String normalizedEmail) {
		return jdbc.sql("SELECT email_verified FROM customer_account WHERE email = :email")
				.param(EMAIL, normalizedEmail)
				.query(Boolean.class)
				.optional();
	}

	@Override
	public String emailOf(CustomerAccountId accountId) {
		return jdbc.sql("SELECT email FROM customer_account WHERE id = :id")
				.param(ID, accountId.value())
				.query(String.class)
				.single();
	}

	private Optional<Long> liveAccountIdForIdentity(SsoProvider provider, String subject) {
		return jdbc.sql("""
				SELECT i.account_id FROM customer_sso_identity i
				JOIN customer_account a ON a.id = i.account_id AND a.erased_at IS NULL
				WHERE i.provider = :provider AND i.subject = :subject
				""")
				.param(PROVIDER, provider.name())
				.param(SUBJECT, subject)
				.query(Long.class)
				.optional();
	}
}
