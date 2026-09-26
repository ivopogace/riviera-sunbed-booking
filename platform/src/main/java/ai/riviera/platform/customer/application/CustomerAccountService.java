package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * The {@code customer} module's account application service (credential reads, registration, SSO,
 * recovery), package-private behind the published ports (invariant #11). Holds <strong>no</strong>
 * Spring Security type (RV-BE-11): the edge encodes passwords and generates + hashes recovery
 * tokens ({@link CustomerAccountRecovery}); this service stores the opaque digests, claims a token
 * single-use atomically, and flips verification / password state. Email is normalized here
 * ({@link Emails}) so account and guest emails resolve identically.
 */
@Service
class CustomerAccountService implements CustomerAccounts, CustomerAccountProvisioning,
		CustomerAccountDirectory, SsoAccountProvisioning, CustomerAccountRecovery {

	private final CustomerAccountStore store;
	private final CustomerAccountTokens tokens;

	CustomerAccountService(CustomerAccountStore store, CustomerAccountTokens tokens) {
		this.store = store;
		this.tokens = tokens;
	}

	@Override
	public Optional<CustomerAccountCredential> findByEmail(String email) {
		return store.findByEmail(Emails.normalize(email));
	}

	@Override
	public Optional<CustomerAccountId> accountFor(String email) {
		return store.findIdByEmail(Emails.normalize(email));
	}

	@Override
	@Transactional
	public RegistrationOutcome register(String email, String passwordHash) {
		return store.insertIfAbsent(Emails.normalize(email), passwordHash);
	}

	@Override
	@Transactional
	public CustomerAccountId resolveOrCreate(SsoProvider provider, String subject, String email) {
		return store.resolveSsoAccount(provider, subject, Emails.normalize(email));
	}

	@Override
	@Transactional
	public void issueEmailVerificationToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
		tokens.issue(accountId, TokenPurpose.VERIFY_EMAIL, tokenHash, expiresAt);
	}

	@Override
	@Transactional
	public void issuePasswordResetToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
		tokens.issue(accountId, TokenPurpose.RESET_PASSWORD, tokenHash, expiresAt);
	}

	@Override
	@Transactional
	public VerifyEmailOutcome verifyEmail(String tokenHash) {
		return tokens.consume(TokenPurpose.VERIFY_EMAIL, tokenHash)
				.<VerifyEmailOutcome>map(accountId -> {
					store.markEmailVerified(accountId);
					return new VerifyEmailOutcome.Verified(accountId);
				})
				.orElseGet(VerifyEmailOutcome.InvalidOrExpired::new);
	}

	@Override
	@Transactional
	public ResetPasswordOutcome resetPassword(String tokenHash, String newPasswordHash) {
		return tokens.consume(TokenPurpose.RESET_PASSWORD, tokenHash)
				.<ResetPasswordOutcome>map(accountId -> {
					store.updatePasswordHash(accountId, newPasswordHash);
					return new ResetPasswordOutcome.Reset(accountId, store.emailOf(accountId));
				})
				.orElseGet(ResetPasswordOutcome.InvalidOrExpired::new);
	}

	@Override
	public Optional<String> emailForResetToken(String tokenHash) {
		return tokens.accountFor(TokenPurpose.RESET_PASSWORD, tokenHash).map(store::emailOf);
	}

	@Override
	@Transactional
	public void setPassword(CustomerAccountId accountId, String newPasswordHash) {
		store.updatePasswordHash(accountId, newPasswordHash);
	}

	@Override
	public Optional<Boolean> emailVerifiedFor(String email) {
		return store.emailVerifiedFor(Emails.normalize(email));
	}

}
