package ai.riviera.platform;

import java.net.URI;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.auth.application.CustomerRecovery;
import ai.riviera.platform.auth.application.OperatorResetLinks;
import ai.riviera.platform.auth.application.RecoveryProperties;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.ResetLinkOutcome;
import ai.riviera.platform.shared.SiteLocale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * A recovery token lapses on the clock that minted it (#1857, invariant #6): issued through {@code auth} at the
 * context's {@link MovableClock}, refused once that clock passes the TTL, and stamped consumed or retired at that
 * clock's instant. So expiry holds under {@code RIVIERA_TEST_TRAVEL_TO}, where the database's {@code NOW()} stays on the wall.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, TiraneDaytimeClock.class })
@SpringBootTest
class RecoveryTokenExpiryIT {

	private static final Duration SECOND = Duration.ofSeconds(1);

	@Autowired
	CustomerRecovery customerRecovery;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	OperatorResetLinks resetLinks;
	@Autowired
	OperatorPasswordReset operatorReset;
	@Autowired
	OperatorProvisioning operatorProvisioning;
	@Autowired
	RecoveryProperties properties;
	@Autowired
	MockMailer mailer;
	@Autowired
	MovableClock clock;
	@Autowired
	JdbcClient jdbc;

	private Instant contextStart;
	private Instant start;

	@BeforeEach
	void pinTheClock() {
		contextStart = clock.instant();
		start = contextStart.truncatedTo(ChronoUnit.SECONDS);
		clock.set(start);
		mailer.clear();
	}

	@AfterEach
	void restoreTheClock() {
		clock.set(contextStart);
	}

	@Test
	void aVerificationTokenLapsesOnTheApplicationClock() {
		String email = "expiry-verify@example.com";
		CustomerAccountId account = register(email);
		Duration ttl = properties.verificationTokenTtl();

		customerRecovery.sendVerificationEmail(account, email, SiteLocale.EN);
		String lapsed = lastToken(email, SentEmail.Kind.EMAIL_VERIFICATION);
		Instant afterExpiry = start.plus(ttl).plus(SECOND);
		clock.set(afterExpiry);

		assertInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class, customerRecovery.verifyEmail(lapsed));
		assertEquals(Optional.of(false), customerRecovery.verifiedFor(email));

		customerRecovery.sendVerificationEmail(account, email, SiteLocale.EN);
		String live = lastToken(email, SentEmail.Kind.EMAIL_VERIFICATION);
		assertEquals(afterExpiry, customerConsumedAt(lapsed), "the re-issue retires the lapsed token at the clock's instant");
		Instant lastLiveSecond = afterExpiry.plus(ttl).minus(SECOND);
		clock.set(lastLiveSecond);

		assertEquals(new VerifyEmailOutcome.Verified(account), customerRecovery.verifyEmail(live));
		assertEquals(lastLiveSecond, customerConsumedAt(live), "the redemption is stamped at the clock's instant");
	}

	@Test
	void aCustomerResetTokenLapsesOnTheApplicationClock() {
		String email = "expiry-reset@example.com";
		CustomerAccountId account = register(email);
		Duration ttl = properties.resetTokenTtl();

		customerRecovery.sendPasswordResetEmail(account, email, SiteLocale.EN);
		String token = lastToken(email, SentEmail.Kind.PASSWORD_RESET);
		clock.set(start.plus(ttl).minus(SECOND));
		assertEquals(Optional.of(email), customerRecovery.emailForResetToken(token), "live until its last second");

		clock.set(start.plus(ttl).plus(SECOND));

		assertEquals(Optional.empty(), customerRecovery.emailForResetToken(token));
		assertInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class, customerRecovery.resetPassword(token, "{bcrypt}lapsed"));
		assertEquals("{bcrypt}orig", customerPasswordHash(account));
	}

	@Test
	void anOperatorResetLinkLapsesAtTheExpiryTheAdminWasShown() {
		OperatorId operator = provisionOperator("expiry-operator");
		OperatorResetLinks.MintedToken minted = resetLinks.mint();
		assertEquals(start.plus(properties.resetTokenTtl()), minted.expiresAt());
		assertEquals(new ResetLinkOutcome.Issued(), operatorReset.issue(operator, minted.tokenHash(), minted.expiresAt()));

		clock.set(minted.expiresAt().minus(SECOND));
		assertEquals(Optional.of("expiry-operator"), operatorReset.usernameForResetToken(minted.tokenHash()));

		clock.set(minted.expiresAt().plus(SECOND));

		assertEquals(Optional.empty(), operatorReset.usernameForResetToken(minted.tokenHash()));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class,
				operatorReset.resetPassword(minted.tokenHash(), "{bcrypt}lapsed"));
		assertEquals("{bcrypt}seeded", operatorPasswordHash(operator));
	}

	@Test
	void anOperatorRedemptionAndRetirementAreStampedAtTheApplicationClock() {
		OperatorId operator = provisionOperator("expiry-operator-stamp");
		OperatorResetLinks.MintedToken first = resetLinks.mint();
		operatorReset.issue(operator, first.tokenHash(), first.expiresAt());
		Instant reissuedAt = start.plus(Duration.ofMinutes(10));
		clock.set(reissuedAt);
		OperatorResetLinks.MintedToken second = resetLinks.mint();
		operatorReset.issue(operator, second.tokenHash(), second.expiresAt());
		assertEquals(reissuedAt, operatorConsumedAt(first.tokenHash()), "the re-issue retires the first link at the clock's instant");

		Instant redeemedAt = reissuedAt.plus(Duration.ofMinutes(5));
		clock.set(redeemedAt);

		assertInstanceOf(OperatorResetOutcome.Reset.class, operatorReset.resetPassword(second.tokenHash(), "{bcrypt}new"));
		assertEquals(redeemedAt, operatorConsumedAt(second.tokenHash()));
	}

	private CustomerAccountId register(String email) {
		jdbc.sql("DELETE FROM customer_account WHERE email = :email").param("email", email).update();
		RegistrationOutcome outcome = customerProvisioning.register(email, "{bcrypt}orig");
		return ((RegistrationOutcome.Registered) outcome).accountId();
	}

	private OperatorId provisionOperator(String username) {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
		return operatorProvisioning.provision(username, "{bcrypt}seeded");
	}

	private String lastToken(String email, SentEmail.Kind kind) {
		URI link = mailer.sent().stream()
				.filter(mail -> mail.kind() == kind && mail.toEmail().equals(email))
				.reduce((earlier, later) -> later)
				.orElseThrow()
				.link();
		return UriComponentsBuilder.fromUri(link).build().getQueryParams().getFirst("token");
	}

	private Instant customerConsumedAt(String rawToken) {
		return jdbc.sql("SELECT consumed_at FROM customer_account_token WHERE token_hash = :h")
				.param("h", resetLinks.hash(rawToken))
				.query(Timestamp.class)
				.single()
				.toInstant();
	}

	private Instant operatorConsumedAt(String tokenHash) {
		return jdbc.sql("SELECT consumed_at FROM operator_password_reset_token WHERE token_hash = :h")
				.param("h", tokenHash)
				.query(Timestamp.class)
				.single()
				.toInstant();
	}

	private String customerPasswordHash(CustomerAccountId account) {
		return jdbc.sql("SELECT password_hash FROM customer_account WHERE id = :id")
				.param("id", account.value())
				.query(String.class)
				.single();
	}

	private String operatorPasswordHash(OperatorId operator) {
		return jdbc.sql("SELECT password_hash FROM operator WHERE id = :id")
				.param("id", operator.value())
				.query(String.class)
				.single();
	}
}
