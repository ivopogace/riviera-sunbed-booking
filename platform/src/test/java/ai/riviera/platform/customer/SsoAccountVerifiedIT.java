package ai.riviera.platform.customer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S8 (#113, AC-8): an SSO email is provider-verified (design D-6), so a first SSO sign-in creates the
 * account already {@code email_verified = true}, and auto-linking an SSO identity to an existing
 * (unverified) password account flips that account to verified. Also exercises the V28 backfill UPDATE —
 * which cannot run against pre-existing data in a fresh-container migration — by inserting a simulated
 * pre-V28 SSO-linked (unverified) account and running the migration's {@code WHERE EXISTS} statement,
 * proving it flips only SSO-linked rows.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SsoAccountVerifiedIT {

	@Autowired
	SsoAccountProvisioning sso;
	@Autowired
	CustomerAccountProvisioning provisioning;
	@Autowired
	CustomerAccountRecovery recovery;
	@Autowired
	JdbcTemplate jdbc;

	@Test
	void firstSsoSignInCreatesAVerifiedAccount() {
		sso.resolveOrCreate(SsoProvider.GOOGLE, "verified-sub-1", "sso-verified@example.com");

		assertThat(recovery.emailVerifiedFor("sso-verified@example.com"))
				.as("an SSO email is provider-verified (D-6)").contains(true);
	}

	@Test
	void autoLinkingSsoToAnExistingPasswordAccountMarksItVerified() {
		RegistrationOutcome registered = provisioning.register("link-verified@example.com", "{bcrypt}pw");
		CustomerAccountId account = ((RegistrationOutcome.Registered) registered).accountId();
		assertThat(recovery.emailVerifiedFor("link-verified@example.com"))
				.as("a password account starts unverified").contains(false);

		CustomerAccountId linked =
				sso.resolveOrCreate(SsoProvider.APPLE, "verified-sub-2", "link-verified@example.com");

		assertThat(linked).isEqualTo(account);
		assertThat(recovery.emailVerifiedFor("link-verified@example.com"))
				.as("auto-link marks the existing account verified").contains(true);
	}

	@Test
	void v28BackfillFlipsOnlySsoLinkedAccounts() {
		// Simulate pre-V28 rows: an SSO-linked account and a password-only account, both unverified.
		jdbc.update("INSERT INTO customer_account (email, password_hash, email_verified) VALUES (?, NULL, false)",
				"backfill-sso@example.com");
		Long ssoId = jdbc.queryForObject(
				"SELECT id FROM customer_account WHERE email = ?", Long.class, "backfill-sso@example.com");
		jdbc.update("INSERT INTO customer_sso_identity (account_id, provider, subject, email) VALUES (?, ?, ?, ?)",
				ssoId, "GOOGLE", "backfill-sub", "backfill-sso@example.com");
		jdbc.update("INSERT INTO customer_account (email, password_hash, email_verified) VALUES (?, ?, false)",
				"backfill-pw@example.com", "{bcrypt}pw");

		// The V28 backfill statement (verbatim intent).
		jdbc.update("""
				UPDATE customer_account ca
				   SET email_verified = true, email_verified_at = NOW()
				 WHERE EXISTS (SELECT 1 FROM customer_sso_identity si WHERE si.account_id = ca.id)""");

		assertThat(verified("backfill-sso@example.com")).as("SSO-linked → backfilled verified").isTrue();
		assertThat(verified("backfill-pw@example.com")).as("password-only → left unverified").isFalse();
	}

	private boolean verified(String email) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT email_verified FROM customer_account WHERE email = ?", Boolean.class, email));
	}
}
