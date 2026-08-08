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
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the customer-account storage slice against real Postgres via Testcontainers —
 * which also boots the full Flyway chain, so this exercises migration <strong>V25</strong> (Phase 0):
 * registration stores only the opaque hash under a normalized email; a duplicate email is a
 * non-enumerating no-op that neither writes a second row nor overwrites the hash; and the
 * {@code INSERT … ON CONFLICT DO NOTHING} claim is race-safe under concurrent registration (the
 * {@code customer_account_email_uniq} constraint enforces one account per email — invariant #12).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcCustomerAccountsIT {

	@Autowired
	CustomerAccountProvisioning provisioning;

	@Autowired
	CustomerAccounts accounts;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void registerStoresOnlyTheHashUnderANormalizedEmail() {
		RegistrationOutcome outcome = provisioning.register("Bob@Example.com", "{bcrypt}$2a$bobhash");
		assertThat(outcome).isInstanceOf(RegistrationOutcome.Registered.class);

		String storedHash = jdbc.queryForObject(
				"SELECT password_hash FROM customer_account WHERE email = ?", String.class, "bob@example.com");
		assertThat(storedHash).isEqualTo("{bcrypt}$2a$bobhash");

		assertThat(accounts.findByEmail("  BOB@example.com ")) // case/space-insensitive lookup
				.get().extracting(CustomerAccountCredential::passwordHash).isEqualTo("{bcrypt}$2a$bobhash");
	}

	@Test
	void duplicateEmailIsAlreadyRegisteredAndWritesNoSecondRow() {
		provisioning.register("carol@example.com", "{bcrypt}first");

		RegistrationOutcome again = provisioning.register("Carol@Example.com", "{bcrypt}second");

		assertThat(again).isEqualTo(new RegistrationOutcome.AlreadyRegistered());
		Integer rows = jdbc.queryForObject(
				"SELECT count(*) FROM customer_account WHERE email = ?", Integer.class, "carol@example.com");
		assertThat(rows).isEqualTo(1);
		String storedHash = jdbc.queryForObject(
				"SELECT password_hash FROM customer_account WHERE email = ?", String.class, "carol@example.com");
		assertThat(storedHash).isEqualTo("{bcrypt}first"); // not overwritten
	}

	@Test
	void concurrentRegisterOfTheSameEmailClaimsExactlyOnce() throws Exception {
		String email = "dana@example.com";
		int threads = 6;
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		CountDownLatch start = new CountDownLatch(1);
		List<RegistrationOutcome> results = Collections.synchronizedList(new ArrayList<>());
		List<Future<?>> futures = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			futures.add(pool.submit(() -> {
				start.await();
				results.add(provisioning.register(email, "{bcrypt}h"));
				return null;
			}));
		}
		start.countDown();
		for (Future<?> f : futures) {
			f.get();
		}
		pool.shutdown();

		long registered = results.stream().filter(RegistrationOutcome.Registered.class::isInstance).count();
		assertThat(registered).as("exactly one concurrent registration may create the account").isEqualTo(1);
		Integer rows = jdbc.queryForObject(
				"SELECT count(*) FROM customer_account WHERE email = ?", Integer.class, email);
		assertThat(rows).isEqualTo(1);
	}
}
