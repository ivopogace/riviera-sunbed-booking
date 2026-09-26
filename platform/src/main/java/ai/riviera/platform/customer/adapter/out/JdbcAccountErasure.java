package ai.riviera.platform.customer.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.AccountErasureStore;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * JDBC adapter for {@link AccountErasureStore} (invariant #1). Every scrub is an idempotent tombstone-in-place
 * {@code UPDATE … WHERE erased_at IS NULL}, never a hard delete of a row a retained booking references
 * (ADR-0010); only transient child rows are deleted. The tombstone email is unique per row and unroutable
 * ({@code .invalid}, RFC 2606). Request erasure and the retention sweep share {@link #GUEST_TOMBSTONE}; the
 * by-email scrubs return the ids they tombstoned so the service can reach those subjects' reviews.
 */
@Repository
class JdbcAccountErasure implements AccountErasureStore {

	/** SQL named-param keys, named not duplicated (conventions §6a). */
	private static final String ID = "id";
	private static final String EMAIL = "email";
	private static final String ACCOUNT_ID = "accountId";
	private static final String OLDER_THAN = "olderThan";
	private static final String LIMIT = "limit";

	/**
	 * The guest tombstone, shared by both scrub paths (right-to-erasure by email, retention sweep by id) so
	 * the two can never drift apart on what "erased" means; only the WHERE clause differs.
	 */
	private static final String GUEST_TOMBSTONE = """
			UPDATE customer
			SET email = 'erased+' || id || '@erased.invalid', full_name = 'ERASED', phone = 'ERASED',
			    erased_at = NOW(), updated_at = NOW()
			""";

	private final JdbcClient jdbc;

	/**
	 * Used by the retention sweep's candidate read alone. See {@link #boundedClient}.
	 */
	private final JdbcClient sweepJdbc;

	JdbcAccountErasure(JdbcClient jdbc, DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = jdbc;
		this.sweepJdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * A finite-{@code queryTimeout} client for {@link #expiredGuestCandidates} alone (Postgres's default is
	 * infinite); scrubs stay on the shared client. Never set {@code spring.jdbc.template.query-timeout} globally:
	 * it would bound {@code availability}'s claim (invariant #2), as {@code ScheduledWorkArchitectureTest} enforces.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
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
	public Optional<CustomerAccountId> eraseAccountByEmail(String normalizedEmail) {
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :email AND erased_at IS NULL")
				.param(EMAIL, normalizedEmail)
				.query(Long.class)
				.optional()
				.map(CustomerAccountId::new)
				.filter(this::eraseAccountById);
	}

	@Override
	public List<CustomerId> eraseGuestByEmail(String normalizedEmail) {
		return jdbc.sql(GUEST_TOMBSTONE + "WHERE email = :email AND erased_at IS NULL RETURNING id")
				.param(EMAIL, normalizedEmail)
				.query((rs, rowNum) -> new CustomerId(rs.getLong("id")))
				.list();
	}

	@Override
	public List<CustomerId> expiredGuestCandidates(Instant olderThan, int limit) {
		// sweepJdbc, not jdbc: this read opens a scheduled run and is bounded.
		return sweepJdbc.sql("""
				SELECT c.id FROM customer c
				WHERE c.erased_at IS NULL
				  AND c.updated_at < :olderThan
				  AND NOT EXISTS (SELECT 1 FROM customer_account a
				                  WHERE a.email = c.email AND a.erased_at IS NULL)
				ORDER BY c.id
				LIMIT :limit
				""")
				.param(OLDER_THAN, Timestamp.from(olderThan))
				.param(LIMIT, limit)
				.query((rs, rowNum) -> new CustomerId(rs.getLong("id")))
				.list();
	}

	@Override
	public boolean eraseGuestById(CustomerId guestId) {
		return jdbc.sql(GUEST_TOMBSTONE + "WHERE id = :id AND erased_at IS NULL")
				.param(ID, guestId.value())
				.update() > 0;
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
