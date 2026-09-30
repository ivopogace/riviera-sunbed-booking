package ai.riviera.platform.customer;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.LockOrderRace;
import ai.riviera.platform.PausingPorts;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Account-scoped writes against a concurrent erasure (#1307): no SSO identity or recovery token outlives the
 * account's erasure, two reset issues leave one live link, and a lost first SSO sign-in leaves no account behind.
 * Where the race sits inside one store call, a third transaction holds the identity key the sign-in inserts; it is
 * declared after the pool, so a failed wait closes (rolls back) it before the pool waits for the sign-ins.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest
class CustomerErasureRaceIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final Instant FUTURE = Instant.now().plus(Duration.ofHours(1));

	@Autowired
	CustomerAccountProvisioning provisioning;
	@Autowired
	SsoAccountProvisioning sso;
	@Autowired
	CustomerAccountRecovery recovery;
	@Autowired
	CustomerAccounts accounts;
	@Autowired
	AccountErasure erasure;
	@Autowired
	DataSource dataSource;
	@Autowired
	JdbcClient jdbc;

	private int holderPid;

	@Test
	void anSsoIdentityNeverOutlivesItsAccountsErasure() throws Exception {
		String email = unique("sso-erased");
		CustomerAccountId account = register(email);
		String subject = unique("sub");

		try (ExecutorService pool = Executors.newFixedThreadPool(2);
				Connection holder = holdIdentity(register(unique("holder")), subject)) {
			Future<CustomerAccountId> signIn = pool.submit(() -> sso.resolveOrCreate(SsoProvider.GOOGLE, subject, email));
			awaitBlocked(1);
			Future<EraseOutcome> erased = pool.submit(() -> erasure.eraseAccount(account));
			Awaitility.await().atMost(WAIT).until(() -> erased.isDone() || blocked() >= 2);
			holder.rollback();

			signIn.get(WAIT.toSeconds(), TimeUnit.SECONDS);
			assertThat(erased.get(WAIT.toSeconds(), TimeUnit.SECONDS)).isEqualTo(EraseOutcome.ERASED);
		}
		assertThat(identitiesOnErasedAccounts(subject)).as("the erasure took the identity with the account").isZero();
	}

	@Test
	void anSsoSignInWhoseAccountWasErasedMeanwhileGetsAFreshAccount() throws Exception {
		String email = unique("sso-fresh");
		CustomerAccountId erased = register(email);
		String subject = unique("sub");

		LockOrderRace.Outcome<CustomerAccountId, EraseOutcome> outcome = LockOrderRace.race(jdbc,
				"claimAccountForSso", args -> email.equals(args[0]),
				() -> sso.resolveOrCreate(SsoProvider.GOOGLE, subject, email),
				() -> erasure.eraseAccount(erased));

		assertThat(outcome.raced()).isEqualTo(EraseOutcome.ERASED);
		assertThat(outcome.held()).isNotEqualTo(erased);
		assertThat(accounts.liveCredential(outcome.held())).get().extracting(c -> c.email()).isEqualTo(email);
		assertThat(identityAccount(subject)).contains(outcome.held().value());
	}

	@Test
	void anIdentityOfAnErasedAccountIsAdoptedByAFreshOne() {
		String email = unique("sso-stale");
		CustomerAccountId erased = register(email);
		String subject = unique("sub");
		erasure.eraseAccount(erased);
		jdbc.sql("INSERT INTO customer_sso_identity (account_id, provider, subject, email) VALUES (:a, 'GOOGLE', :s, :e)")
				.param("a", erased.value()).param("s", subject).param("e", email).update();

		CustomerAccountId resolved = sso.resolveOrCreate(SsoProvider.GOOGLE, subject, email);

		assertThat(resolved).isNotEqualTo(erased);
		assertThat(accounts.liveCredential(resolved)).isPresent();
		assertThat(identityAccount(subject)).contains(resolved.value());
	}

	@Test
	void concurrentFirstSignInsOfOneSubjectLeaveNoStrayAccount() throws Exception {
		CustomerAccountId winner = register(unique("winner"));
		String subject = unique("sub");
		String first = unique("stray-a");
		String second = unique("stray-b");

		try (ExecutorService pool = Executors.newFixedThreadPool(2); Connection holder = holdIdentity(winner, subject)) {
			Future<CustomerAccountId> a = pool.submit(() -> sso.resolveOrCreate(SsoProvider.GOOGLE, subject, first));
			Future<CustomerAccountId> b = pool.submit(() -> sso.resolveOrCreate(SsoProvider.GOOGLE, subject, second));
			awaitBlocked(2);
			holder.commit();

			assertThat(List.of(a.get(WAIT.toSeconds(), TimeUnit.SECONDS), b.get(WAIT.toSeconds(), TimeUnit.SECONDS)))
					.containsOnly(winner);
		}
		assertThat(jdbc.sql("SELECT COUNT(*) FROM customer_account WHERE email IN (:a, :b)")
				.param("a", first).param("b", second).query(Long.class).single())
				.as("neither loser left the account it created behind").isZero();
	}

	@Test
	void aTokenIssuedDuringAnErasureIsNeverStored() throws Exception {
		CustomerAccountId account = register(unique("token-erased"));

		LockOrderRace.Outcome<EraseOutcome, Boolean> outcome = LockOrderRace.race(jdbc, "eraseAccountById",
				args -> account.equals(args[0]),
				() -> erasure.eraseAccount(account),
				() -> recovery.issuePasswordResetToken(account, unique("late-token"), FUTURE));

		assertThat(outcome.racerWaited()).as("the issue waited on the erasure").isTrue();
		assertThat(outcome.raced()).as("so no link is mailed").isFalse();
		assertThat(tokenCount(account)).as("no token outlives the erasure").isZero();
	}

	@Test
	void twoConcurrentResetIssuesLeaveOneLiveLink() throws Exception {
		CustomerAccountId account = register(unique("two-links"));
		String firstLink = unique("link-1");
		String secondLink = unique("link-2");

		LockOrderRace.race(jdbc, "issue", args -> firstLink.equals(args[2]),
				() -> {
					recovery.issuePasswordResetToken(account, firstLink, FUTURE);
					return null;
				},
				() -> {
					recovery.issuePasswordResetToken(account, secondLink, FUTURE);
					return null;
				});

		assertThat(jdbc.sql("""
				SELECT token_hash FROM customer_account_token
				WHERE account_id = :a AND purpose = 'RESET_PASSWORD' AND consumed_at IS NULL
				""").param("a", account.value()).query(String.class).list())
				.as("only the newest link works").containsExactly(secondLink);
	}

	/** An uncommitted identity for {@code (GOOGLE, subject)} on another connection: a sign-in's insert waits on it. */
	private Connection holdIdentity(CustomerAccountId account, String subject) throws SQLException {
		Connection holder = dataSource.getConnection();
		holder.setAutoCommit(false);
		try (PreparedStatement insert = holder.prepareStatement(
				"INSERT INTO customer_sso_identity (account_id, provider, subject, email) VALUES (?, 'GOOGLE', ?, ?)")) {
			insert.setLong(1, account.value());
			insert.setString(2, subject);
			insert.setString(3, subject + "@example.com");
			insert.executeUpdate();
		}
		holderPid = backendPid(holder);
		return holder;
	}

	private void awaitBlocked(int waiters) {
		Awaitility.await().atMost(WAIT).until(() -> jdbc.sql(
				"SELECT COUNT(*) FROM pg_stat_activity WHERE :pid = ANY (pg_blocking_pids(pid))")
				.param("pid", holderPid).query(Long.class).single() >= waiters);
	}

	private long blocked() {
		return jdbc.sql("SELECT COUNT(*) FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0")
				.query(Long.class).single();
	}

	private static int backendPid(Connection connection) throws SQLException {
		try (PreparedStatement select = connection.prepareStatement("SELECT pg_backend_pid()");
				ResultSet rs = select.executeQuery()) {
			rs.next();
			return rs.getInt(1);
		}
	}

	private long identitiesOnErasedAccounts(String subject) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM customer_sso_identity i JOIN customer_account a ON a.id = i.account_id
				WHERE i.subject = :s AND a.erased_at IS NOT NULL
				""").param("s", subject).query(Long.class).single();
	}

	private java.util.Optional<Long> identityAccount(String subject) {
		return jdbc.sql("SELECT account_id FROM customer_sso_identity WHERE provider = 'GOOGLE' AND subject = :s")
				.param("s", subject).query(Long.class).optional();
	}

	private long tokenCount(CustomerAccountId account) {
		return jdbc.sql("SELECT COUNT(*) FROM customer_account_token WHERE account_id = :a")
				.param("a", account.value()).query(Long.class).single();
	}

	private CustomerAccountId register(String email) {
		return ((RegistrationOutcome.Registered) provisioning.register(email, "{bcrypt}orig")).accountId();
	}

	private static String unique(String prefix) {
		return prefix + "-" + System.nanoTime() + "@example.com";
	}
}
