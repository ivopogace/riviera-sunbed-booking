package ai.riviera.platform.customer;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the account-recovery token store against real Postgres via Testcontainers — which
 * boots the full Flyway chain, so this also exercises migration <strong>V28</strong> (the
 * {@code email_verified} columns + the {@code customer_account_token} table with its {@code token_hash}
 * UNIQUE constraint and the atomic single-use/expiry claim). Covers: a verification token redeems once
 * and marks the account verified; a reset token redeems once and rotates the password hash; a
 * second-use or expired token yields the neutral {@code InvalidOrExpired}; and issuing a new token of a
 * purpose invalidates the account's prior unconsumed one. The edge-level session-invalidation,
 * non-enumeration, and rate-limit behaviour are pinned separately by the controller ITs.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CustomerAccountRecoveryIT {

	private static final Instant FUTURE = Instant.now().plus(Duration.ofHours(1));
	private static final Instant PAST = Instant.now().minus(Duration.ofMinutes(5));

	@Autowired
	CustomerAccountRecovery recovery;

	@Autowired
	CustomerAccountProvisioning provisioning;

	@Autowired
	CustomerAccounts accounts;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void verifyEmail_firstRedeemsMarksVerified_secondAndExpiredFail() {
		CustomerAccountId id = register("verify@example.com");
		assertThat(recovery.emailVerifiedFor("verify@example.com")).as("a fresh account is unverified").contains(false);
		recovery.issueEmailVerificationToken(id, "vh-valid", FUTURE);

		VerifyEmailOutcome first = recovery.verifyEmail("vh-valid");

		assertThat(first).isEqualTo(new VerifyEmailOutcome.Verified(id));
		assertThat(recovery.emailVerifiedFor("verify@example.com")).contains(true);
		assertThat(verifiedAtRows(id)).as("email_verified_at is stamped").isEqualTo(1);

		assertThat(recovery.verifyEmail("vh-valid"))
				.as("single-use: a second redemption of the same token fails")
				.isInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class);

		CustomerAccountId other = register("verify-expired@example.com");
		recovery.issueEmailVerificationToken(other, "vh-expired", PAST);
		assertThat(recovery.verifyEmail("vh-expired"))
				.as("an expired token cannot verify").isInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class);
		assertThat(recovery.emailVerifiedFor("verify-expired@example.com")).contains(false);
	}

	@Test
	void resetPassword_setsHashOnce_secondAndExpiredFail() {
		CustomerAccountId id = register("reset@example.com");
		recovery.issuePasswordResetToken(id, "rh-valid", FUTURE);

		ResetPasswordOutcome outcome = recovery.resetPassword("rh-valid", "{bcrypt}rotated");

		assertThat(outcome).isEqualTo(new ResetPasswordOutcome.Reset(id, "reset@example.com"));
		assertThat(accounts.findByEmail("reset@example.com")).get()
				.extracting(c -> c.passwordHash()).isEqualTo("{bcrypt}rotated");

		assertThat(recovery.resetPassword("rh-valid", "{bcrypt}again"))
				.as("single-use: the reset token cannot be replayed")
				.isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);

		CustomerAccountId other = register("reset-expired@example.com");
		recovery.issuePasswordResetToken(other, "rh-expired", PAST);
		assertThat(recovery.resetPassword("rh-expired", "{bcrypt}nope"))
				.as("an expired token cannot reset").isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);
		assertThat(accounts.findByEmail("reset-expired@example.com")).get()
				.extracting(c -> c.passwordHash()).isEqualTo("{bcrypt}orig");
	}

	@Test
	void issuingANewTokenInvalidatesThePriorUnconsumedOne() {
		CustomerAccountId id = register("reissue@example.com");
		recovery.issuePasswordResetToken(id, "rh-old", FUTURE);
		recovery.issuePasswordResetToken(id, "rh-new", FUTURE);

		assertThat(recovery.resetPassword("rh-old", "{bcrypt}x"))
				.as("only the newest link works").isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);
		assertThat(recovery.resetPassword("rh-new", "{bcrypt}y"))
				.isEqualTo(new ResetPasswordOutcome.Reset(id, "reissue@example.com"));
	}

	/**
	 * The resolve-<em>without</em>-consume read that lets the edge revoke the account's sessions
	 * before the reset writes anything. Reading it must not spend the single use — otherwise the reset it
	 * precedes would fail as already-redeemed.
	 */
	@Test
	void emailForResetTokenResolvesTheAccountWithoutConsumingTheToken() {
		CustomerAccountId id = register("named@example.com");
		recovery.issuePasswordResetToken(id, "rh-named", FUTURE);

		assertThat(recovery.emailForResetToken("rh-named")).contains("named@example.com");
		assertThat(recovery.emailForResetToken("rh-named")).as("still readable — the read consumes nothing")
				.contains("named@example.com");
		assertThat(recovery.resetPassword("rh-named", "{bcrypt}rotated"))
				.as("and the token is still redeemable afterwards")
				.isEqualTo(new ResetPasswordOutcome.Reset(id, "named@example.com"));
	}

	/**
	 * The read applies exactly the redemption predicate — unknown, expired, consumed, or issued for the
	 * other purpose all read empty. A disagreement either way would be a bug: revoking sessions for a
	 * token the write then rejects, or writing without having revoked.
	 */
	@Test
	void emailForResetTokenIsEmptyForAnExpiredConsumedOrWrongPurposeToken() {
		CustomerAccountId id = register("named-negative@example.com");
		recovery.issuePasswordResetToken(id, "rh-consumed", FUTURE);
		recovery.resetPassword("rh-consumed", "{bcrypt}rotated");
		recovery.issuePasswordResetToken(id, "rh-gone", PAST);
		recovery.issueEmailVerificationToken(id, "vh-other-purpose", FUTURE);

		assertThat(recovery.emailForResetToken("rh-consumed")).as("consumed").isEmpty();
		assertThat(recovery.emailForResetToken("rh-gone")).as("expired").isEmpty();
		assertThat(recovery.emailForResetToken("vh-other-purpose")).as("wrong purpose").isEmpty();
		assertThat(recovery.emailForResetToken("rh-unknown")).as("unknown").isEmpty();
	}

	private CustomerAccountId register(String email) {
		RegistrationOutcome outcome = provisioning.register(email, "{bcrypt}orig");
		return ((RegistrationOutcome.Registered) outcome).accountId();
	}

	private int verifiedAtRows(CustomerAccountId id) {
		return jdbc.queryForObject(
				"SELECT count(*) FROM customer_account WHERE id = ? AND email_verified_at IS NOT NULL",
				Integer.class, id.value());
	}
}
