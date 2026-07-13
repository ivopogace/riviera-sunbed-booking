package ai.riviera.platform.customer.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.CustomerAccountStore;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

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

	/** SQL named-param / column key for the account email (named, not duplicated — invariant #6a). */
	private static final String EMAIL = "email";

	private final JdbcClient jdbc;

	JdbcCustomerAccounts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<CustomerAccountCredential> findByEmail(String normalizedEmail) {
		return jdbc.sql("SELECT email, password_hash FROM customer_account WHERE email = :email")
				.param(EMAIL, normalizedEmail)
				.query((rs, rowNum) -> new CustomerAccountCredential(
						rs.getString(EMAIL), rs.getString("password_hash")))
				.optional();
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
}
