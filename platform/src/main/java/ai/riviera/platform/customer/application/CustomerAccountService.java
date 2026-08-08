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
 * The {@code customer} module's account application service: the read side of an
 * account's stored credential ({@link CustomerAccounts}) and the registration write side
 * ({@link CustomerAccountProvisioning}). This is the service that <strong>graduates</strong> the
 * previously-thin {@code customer} module to the full ADR-0007 template. Package-private behind the
 * published ports (invariant #11); constructor injection into a {@code final} {@link CustomerAccountStore}.
 *
 * <p>It holds <strong>no</strong> Spring Security type: the stored {@code passwordHash} is an opaque
 * blob supplied already-encoded by the edge, and this service never encodes or verifies it — the
 * password-checking machinery stays at the platform edge (RV-BE-11, {@code RESPONSIBILITIES.md}).
 * Likewise for S8 recovery ({@link CustomerAccountRecovery}): the edge generates + hashes the raw token
 * and encodes the new password; this service only stores the opaque digest, atomically claims it
 * single-use, and flips verification / password state. Email is normalized here (trimmed + lower-cased,
 * matching the guest {@code JdbcCustomerDirectory} key) so account and guest emails resolve identically.
 * Writes are {@code @Transactional}; reads are pure queries.
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
