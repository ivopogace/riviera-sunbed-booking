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
 * JDBC adapter for the {@code customer} module's {@link AccountErasureStore} port (ADR-0007
 * {@code adapter/out}). Explicit SQL via {@link JdbcClient} in text blocks, named params,
 * package-private (invariant #1, mirroring {@code JdbcCustomerAccounts} / {@code JdbcCustomerDirectory}).
 *
 * <p>Every scrub is an {@code UPDATE … WHERE erased_at IS NULL} (idempotent + tombstone-in-place, never a
 * hard delete of a row a retained booking references) except the transient child rows, which are deleted.
 * The tombstone email is {@code 'erased+' || id || '@erased.invalid'} — deterministic and unique per row
 * (so it never collides with the {@code email} UNIQUE constraint), on the reserved {@code .invalid} TLD
 * (RFC 2606) so it can never route. Name/phone become the fixed {@code 'ERASED'} placeholder.
 *
 * <p>Since Slice 2 (#101) the same adapter also serves the automated retention sweep: the candidate read
 * applies the two gates {@code customer} can evaluate on its own tables (row age, and no live
 * {@code customer_account} claiming the email), and the by-id scrub reuses the identical guest tombstone —
 * shared as {@link #GUEST_TOMBSTONE} so request-erasure and retention-erasure cannot drift apart. All of it
 * is {@code SELECT}/{@code UPDATE} over existing columns, so the slice needs no migration.
 */
@Repository
class JdbcAccountErasure implements AccountErasureStore {

	/** SQL named-param keys, named not duplicated (invariant #6a). */
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
	 * Used by the retention sweep's candidate read alone (#395). See {@link #boundedClient}.
	 */
	private final JdbcClient sweepJdbc;

	JdbcAccountErasure(JdbcClient jdbc, DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = jdbc;
		this.sweepJdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * A {@link JdbcClient} of this adapter's own with a finite {@code queryTimeout}, used by
	 * {@link #expiredGuestCandidates} and nothing else (#395) — the #386 idiom
	 * ({@code JdbcEmailSuppressions#boundedClient}) applied to scheduled work.
	 *
	 * <p>This read opens the retention sweep, and it is the widest of the three scheduled candidate
	 * queries: it scans {@code customer} with a correlated {@code NOT EXISTS} against
	 * {@code customer_account}, so it has two tables' worth of ways to wait. Postgres's default
	 * statement timeout is infinite, so without this an unbounded wait would hold the sweep's thread
	 * and its pooled connection for the life of the process.
	 *
	 * <p>The scrub itself stays on the shared unbounded client, deliberately: erasure writes are the
	 * same guarded {@code UPDATE … WHERE erased_at IS NULL} the request-thread right-to-erasure path
	 * uses (ADR-0010), and a half-applied retention batch is worth less than a slow one. A bound here
	 * costs the run, which the next tick repeats — the sweep is batch-limited and idempotent by
	 * construction. And it is scoped rather than global for the reason
	 * {@code ScheduledWorkArchitectureTest} now enforces: {@code spring.jdbc.template.query-timeout}
	 * would also bound {@code availability}'s claim (invariant #2).
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
		return jdbc.sql(GUEST_TOMBSTONE + "WHERE email = :email AND erased_at IS NULL")
				.param(EMAIL, normalizedEmail)
				.update();
	}

	@Override
	public List<CustomerId> expiredGuestCandidates(Instant olderThan, int limit) {
		// sweepJdbc, not jdbc: this read opens a scheduled run and is bounded (#395).
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
