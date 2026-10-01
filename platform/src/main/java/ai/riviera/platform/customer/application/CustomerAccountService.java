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
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;
import ai.riviera.platform.customer.vocabulary.NotSignedInCustomerException;
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

	/** Each retry of an SSO resolution needs another erasure to commit under it, so this only ends a pathological run. */
	private static final int SSO_ATTEMPTS = 3;

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
	public Optional<LiveAccountCredential> liveCredential(String email) {
		return store.findLiveCredential(Emails.normalize(email));
	}

	@Override
	public Optional<LiveAccountCredential> liveCredential(CustomerAccountId accountId) {
		return store.findLiveCredential(accountId);
	}

	@Override
	public Optional<CustomerAccountId> accountFor(String email) {
		return store.findIdByEmail(Emails.normalize(email));
	}

	@Override
	public Optional<CustomerAccountId> signedInAccount(String principalName, boolean customerPrincipal) {
		if (!customerPrincipal || principalName == null) {
			return Optional.empty();
		}
		return accountFor(principalName);
	}

	@Override
	public CustomerAccountId requireSignedInAccount(String principalName, boolean customerPrincipal) {
		return signedInAccount(principalName, customerPrincipal).orElseThrow(NotSignedInCustomerException::new);
	}

	@Override
	@Transactional
	public RegistrationOutcome register(String email, String passwordHash) {
		return store.insertIfAbsent(Emails.normalize(email), passwordHash);
	}

	@Override
	@Transactional
	public CustomerAccountId resolveOrCreate(SsoProvider provider, String subject, String email) {
		String normalized = Emails.normalize(email);
		Optional<CustomerAccountId> createdHere = Optional.empty();
		for (int attempt = 0; attempt < SSO_ATTEMPTS; attempt++) {
			// The returning subject first, so a changed provider email never spawns a second account.
			Optional<CustomerAccountId> returning = store.accountForSsoIdentity(provider, subject);
			if (returning.isPresent()) {
				return keepOnly(returning.get(), createdHere);
			}
			Optional<SsoAccountClaim> claim = store.claimAccountForSso(normalized)
					.filter(claimed -> store.lockLiveAccount(claimed.accountId()));
			if (claim.filter(SsoAccountClaim::created).isPresent()) {
				createdHere = claim.map(SsoAccountClaim::accountId);
			}
			Optional<CustomerAccountId> linked = claim
					.flatMap(claimed -> store.linkSsoIdentity(claimed.accountId(), provider, subject, normalized));
			if (linked.isPresent()) {
				store.markEmailVerified(linked.get()); // an SSO email is provider-verified (design D-6)
				return keepOnly(linked.get(), createdHere);
			}
		}
		throw new IllegalStateException("an erasure took the SSO account on every attempt");
	}

	/** Deletes the account this sign-in created when its subject resolved to another one (#1307). */
	private CustomerAccountId keepOnly(CustomerAccountId resolved, Optional<CustomerAccountId> createdHere) {
		createdHere.filter(created -> !created.equals(resolved)).ifPresent(store::deleteUnlinkedAccount);
		return resolved;
	}

	@Override
	@Transactional
	public boolean issueEmailVerificationToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
		return issue(accountId, TokenPurpose.VERIFY_EMAIL, tokenHash, expiresAt);
	}

	@Override
	@Transactional
	public boolean issuePasswordResetToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
		return issue(accountId, TokenPurpose.RESET_PASSWORD, tokenHash, expiresAt);
	}

	/** Under the live account's row lock, so an erasure and a second issue serialize with it (#1307). */
	private boolean issue(CustomerAccountId accountId, TokenPurpose purpose, String tokenHash, Instant expiresAt) {
		if (!store.lockLiveAccount(accountId)) {
			return false;
		}
		tokens.issue(accountId, purpose, tokenHash, expiresAt);
		return true;
	}

	@Override
	@Transactional
	public VerifyEmailOutcome verifyEmail(String tokenHash) {
		return redeem(TokenPurpose.VERIFY_EMAIL, tokenHash)
				.<VerifyEmailOutcome>map(accountId -> {
					store.markEmailVerified(accountId);
					return new VerifyEmailOutcome.Verified(accountId);
				})
				.orElseGet(VerifyEmailOutcome.InvalidOrExpired::new);
	}

	@Override
	@Transactional
	public ResetPasswordOutcome resetPassword(String tokenHash, String newPasswordHash) {
		return redeem(TokenPurpose.RESET_PASSWORD, tokenHash)
				.<ResetPasswordOutcome>map(accountId -> {
					store.updatePasswordHash(accountId, newPasswordHash);
					tokens.retireAll(accountId, TokenPurpose.RESET_PASSWORD);
					return new ResetPasswordOutcome.Reset(accountId, store.emailOf(accountId));
				})
				.orElseGet(ResetPasswordOutcome.InvalidOrExpired::new);
	}

	/** Consumes the token under its live account's row lock, taken first as erasure takes it (#1305). */
	private Optional<CustomerAccountId> redeem(TokenPurpose purpose, String tokenHash) {
		return tokens.accountFor(purpose, tokenHash)
				.filter(store::lockLiveAccount)
				.flatMap(accountId -> tokens.consume(purpose, tokenHash));
	}

	@Override
	public Optional<String> emailForResetToken(String tokenHash) {
		return tokens.accountFor(TokenPurpose.RESET_PASSWORD, tokenHash).flatMap(store::findLiveCredential)
				.map(LiveAccountCredential::email);
	}

	@Override
	@Transactional
	public boolean changePassword(CustomerAccountId accountId, String currentHash, String newPasswordHash) {
		return store.replacePasswordHash(accountId, currentHash, newPasswordHash);
	}

	@Override
	public Optional<Boolean> emailVerifiedFor(String email) {
		return store.emailVerifiedFor(Emails.normalize(email));
	}

}
