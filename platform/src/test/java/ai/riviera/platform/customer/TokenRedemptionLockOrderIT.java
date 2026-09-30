package ai.riviera.platform.customer;

import java.time.Duration;
import java.time.Instant;

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
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Token redemption and account erasure take the account row first, then its tokens (#1305 pair 5): a redemption
 * paused after consuming its token and an erasure of the same account serialize instead of deadlocking.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest
class TokenRedemptionLockOrderIT {

	private static final Instant FUTURE = Instant.now().plus(Duration.ofHours(1));

	@Autowired
	CustomerAccountProvisioning provisioning;
	@Autowired
	CustomerAccountRecovery recovery;
	@Autowired
	AccountErasure erasure;
	@Autowired
	JdbcClient jdbc;

	@Test
	void aResetAndAnErasureOfTheSameAccountSerialize() throws Exception {
		CustomerAccountId account = register();
		String token = "lock-order-reset-" + System.nanoTime();
		recovery.issuePasswordResetToken(account, token, FUTURE);

		LockOrderRace.Outcome<ResetPasswordOutcome, EraseOutcome> outcome = LockOrderRace.race(jdbc, "consume",
				args -> token.equals(args[1]),
				() -> recovery.resetPassword(token, "{bcrypt}reset"),
				() -> erasure.eraseAccount(account));

		assertThat(outcome.racerWaited()).as("the erasure waited on the reset").isTrue();
		assertThat(outcome.held()).isInstanceOf(ResetPasswordOutcome.Reset.class);
		assertErased(account);
	}

	@Test
	void aVerificationAndAnErasureOfTheSameAccountSerialize() throws Exception {
		CustomerAccountId account = register();
		String token = "lock-order-verify-" + System.nanoTime();
		recovery.issueEmailVerificationToken(account, token, FUTURE);

		LockOrderRace.Outcome<VerifyEmailOutcome, EraseOutcome> outcome = LockOrderRace.race(jdbc, "consume",
				args -> token.equals(args[1]),
				() -> recovery.verifyEmail(token),
				() -> erasure.eraseAccount(account));

		assertThat(outcome.racerWaited()).as("the erasure waited on the verification").isTrue();
		assertThat(outcome.held()).isInstanceOf(VerifyEmailOutcome.Verified.class);
		assertErased(account);
	}

	private void assertErased(CustomerAccountId account) {
		assertThat(jdbc.sql("SELECT erased_at IS NOT NULL AND password_hash IS NULL FROM customer_account WHERE id = :id")
				.param("id", account.value()).query(Boolean.class).single())
				.as("the erasure landed after the redemption, so nothing it wrote survives").isTrue();
		assertThat(jdbc.sql("SELECT COUNT(*) FROM customer_account_token WHERE account_id = :id")
				.param("id", account.value()).query(Long.class).single()).isZero();
	}

	private CustomerAccountId register() {
		RegistrationOutcome outcome = provisioning.register("lock-order-" + System.nanoTime() + "@example.com",
				"{bcrypt}orig");
		return ((RegistrationOutcome.Registered) outcome).accountId();
	}
}
