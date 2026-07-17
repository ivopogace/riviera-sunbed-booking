package ai.riviera.platform.customer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the SSO identity linkage slice (S4 #112) against real Postgres via Testcontainers — which
 * boots the full Flyway chain, so this also exercises migration <strong>V27</strong>: first SSO sign-in
 * for an unknown {@code (provider, subject)} creates a password-less account and a link row; a returning
 * subject reuses it; a first-seen subject whose (verified) email already has an account auto-links to it
 * without creating a duplicate; an SSO-only account has no password credential (null hash filtered from
 * {@link CustomerAccounts#findByEmail}) yet still resolves as an account id; and the resolve-or-create is
 * race-safe under concurrent first sign-ins (the {@code (provider, subject)} UNIQUE constraint enforces
 * one account per identity — invariant #12).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SsoAccountProvisioningIT {

	@Autowired
	SsoAccountProvisioning sso;

	@Autowired
	CustomerAccountProvisioning provisioning;

	@Autowired
	CustomerAccounts accounts;

	@Autowired
	CustomerAccountDirectory directory;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void firstSsoSignInCreatesPasswordlessAccountAndLink_secondReuses() {
		CustomerAccountId first = sso.resolveOrCreate(SsoProvider.GOOGLE, "g-sub-1", "Tourist@Example.com");

		assertThat(accountRows("tourist@example.com")).isEqualTo(1);
		assertThat(jdbc.queryForObject(
				"SELECT password_hash FROM customer_account WHERE email = ?", String.class, "tourist@example.com"))
				.as("an SSO-created account carries no local password")
				.isNull();
		assertThat(identityRows(SsoProvider.GOOGLE, "g-sub-1")).isEqualTo(1);

		CustomerAccountId second = sso.resolveOrCreate(SsoProvider.GOOGLE, "g-sub-1", "tourist@example.com");

		assertThat(second).as("a returning (provider, subject) reuses the same account").isEqualTo(first);
		assertThat(accountRows("tourist@example.com")).isEqualTo(1);
		assertThat(identityRows(SsoProvider.GOOGLE, "g-sub-1")).isEqualTo(1);
	}

	@Test
	void unknownSubjectWithTakenEmailLinksToExistingAccountAndDoesNotOverwrite() {
		RegistrationOutcome registered = provisioning.register("owner@example.com", "{bcrypt}ownerpw");
		CustomerAccountId passwordAccount = ((RegistrationOutcome.Registered) registered).accountId();

		CustomerAccountId linked = sso.resolveOrCreate(SsoProvider.GOOGLE, "g-sub-2", "Owner@Example.com");

		assertThat(linked).as("auto-link by verified email: no duplicate account").isEqualTo(passwordAccount);
		assertThat(accountRows("owner@example.com")).isEqualTo(1);
		assertThat(identityRows(SsoProvider.GOOGLE, "g-sub-2")).isEqualTo(1);
		assertThat(accounts.findByEmail("owner@example.com"))
				.as("linking an SSO identity must not disturb the existing password")
				.get().extracting(c -> c.passwordHash()).isEqualTo("{bcrypt}ownerpw");
	}

	@Test
	void ssoOnlyAccountHasNoPasswordCredentialButResolvesAsAnAccount() {
		sso.resolveOrCreate(SsoProvider.APPLE, "a-sub-1", "apple.tourist@example.com");

		assertThat(accounts.findByEmail("apple.tourist@example.com"))
				.as("password login can never find a password-less SSO account (generic 401, D-8)")
				.isEmpty();
		assertThat(directory.accountFor("apple.tourist@example.com"))
				.as("but the account still resolves by email for session/`/api/me` scoping")
				.isPresent();
	}

	@Test
	void concurrentFirstSsoSignInCreatesExactlyOneAccountAndLink() throws Exception {
		String subject = "g-race";
		String email = "race@example.com";
		int threads = 6;
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		CountDownLatch start = new CountDownLatch(1);
		List<CustomerAccountId> results = Collections.synchronizedList(new ArrayList<>());
		List<Future<?>> futures = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			futures.add(pool.submit(() -> {
				start.await();
				results.add(sso.resolveOrCreate(SsoProvider.GOOGLE, subject, email));
				return null;
			}));
		}
		start.countDown();
		for (Future<?> f : futures) {
			f.get();
		}
		pool.shutdown();

		assertThat(results).as("every concurrent sign-in resolves to the same account").containsOnly(results.get(0));
		assertThat(accountRows(email)).isEqualTo(1);
		assertThat(identityRows(SsoProvider.GOOGLE, subject)).isEqualTo(1);
	}

	private int accountRows(String email) {
		return jdbc.queryForObject("SELECT count(*) FROM customer_account WHERE email = ?", Integer.class, email);
	}

	private int identityRows(SsoProvider provider, String subject) {
		return jdbc.queryForObject(
				"SELECT count(*) FROM customer_sso_identity WHERE provider = ? AND subject = ?",
				Integer.class, provider.name(), subject);
	}
}
