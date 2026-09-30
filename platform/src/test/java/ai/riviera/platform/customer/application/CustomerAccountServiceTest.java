package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit spec for the account service's email normalization + non-enumerating registration + the S8
 * recovery composition (redeem-then-mutate outcome mapping), against hand fakes of the storage ports
 * (no Spring, no DB). The real {@code ON CONFLICT} race-safety, the UNIQUE constraint, and the atomic
 * single-use/expiry token claim are proven separately by {@code JdbcCustomerAccountsIT} /
 * {@code CustomerAccountRecoveryIT}.
 */
class CustomerAccountServiceTest {

	private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");

	private final FakeStore store = new FakeStore();
	private final FakeTokens tokens = new FakeTokens();
	private final CustomerAccountService service = new CustomerAccountService(store, tokens);

	@Test
	void registerCreatesAccountUnderNormalizedEmailAndReturnsRegistered() {
		RegistrationOutcome outcome = service.register("Alice@Example.com ", "{bcrypt}hash");

		assertThat(outcome).isInstanceOf(RegistrationOutcome.Registered.class);
		assertThat(service.findByEmail("alice@example.com")).isPresent();           // stored normalized
		assertThat(service.findByEmail("  ALICE@Example.com  ")).isPresent();       // case/space-insensitive
		assertThat(store.byEmail.get("alice@example.com").passwordHash()).isEqualTo("{bcrypt}hash");
	}

	@Test
	void registerExistingEmailReturnsAlreadyRegisteredAndDoesNotOverwrite() {
		service.register("alice@example.com", "{bcrypt}first");

		RegistrationOutcome again = service.register("  Alice@Example.com  ", "{bcrypt}second");

		assertThat(again).isEqualTo(new RegistrationOutcome.AlreadyRegistered());
		assertThat(store.byEmail).hasSize(1);
		assertThat(store.byEmail.get("alice@example.com").passwordHash())
				.as("a duplicate registration must not overwrite the stored hash")
				.isEqualTo("{bcrypt}first");
	}

	@Test
	void liveCredentialLooksUpTheNormalizedEmail() {
		CustomerAccountId id = registeredId("Alice@Example.com ");

		assertThat(service.liveCredential("  ALICE@Example.com  "))
				.contains(new LiveAccountCredential(id, "alice@example.com", "{bcrypt}pw"));
		assertThat(service.liveCredential(id)).contains(new LiveAccountCredential(id, "alice@example.com", "{bcrypt}pw"));
	}

	@Test
	void accountForResolvesNormalizedEmailToItsAccountId() {
		service.register("Alice@Example.com ", "{bcrypt}hash");

		Optional<CustomerAccountId> resolved = service.accountFor("  ALICE@example.com "); // case/space-insensitive
		assertThat(resolved).isPresent().isEqualTo(store.findIdByEmail("alice@example.com"));
		assertThat(service.accountFor("nobody@example.com")).isEmpty();
	}

	@Test
	void resolveOrCreateNormalizesEmailAndIsIdempotentOnProviderSubject() {
		CustomerAccountId first = service.resolveOrCreate(SsoProvider.GOOGLE, "g-1", "Tourist@Example.com ");
		CustomerAccountId again = service.resolveOrCreate(SsoProvider.GOOGLE, "g-1", "  tourist@example.com");

		assertThat(again).as("a returning (provider, subject) reuses the same account").isEqualTo(first);
		assertThat(service.accountFor("tourist@example.com")).isPresent().contains(first); // stored normalized
		assertThat(service.findByEmail("tourist@example.com"))
				.as("an SSO-only account has no password credential").isEmpty();
	}

	@Test
	void resolveOrCreateAutoLinksToAnExistingAccountByNormalizedEmail() {
		RegistrationOutcome registered = service.register("owner@example.com", "{bcrypt}pw");
		CustomerAccountId passwordAccount = ((RegistrationOutcome.Registered) registered).accountId();

		CustomerAccountId linked = service.resolveOrCreate(SsoProvider.APPLE, "a-1", "  OWNER@Example.com ");

		assertThat(linked).as("auto-link by verified email → the existing account").isEqualTo(passwordAccount);
	}

	@Test
	void verifyEmailRedeemsTokenSingleUseAndMarksVerified() {
		CustomerAccountId id = registeredId("verify@example.com");
		service.issueEmailVerificationToken(id, "hash-v", FUTURE);
		assertThat(service.emailVerifiedFor("verify@example.com")).contains(false);

		VerifyEmailOutcome outcome = service.verifyEmail("hash-v");

		assertThat(outcome).isEqualTo(new VerifyEmailOutcome.Verified(id));
		assertThat(service.emailVerifiedFor("verify@example.com")).contains(true);
		assertThat(service.verifyEmail("hash-v"))
				.as("single-use: a second redemption of the same token fails")
				.isInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class);
	}

	@Test
	void emailVerifiedForUnknownEmailIsEmpty() {
		assertThat(service.emailVerifiedFor("nobody@example.com"))
				.as("no account → empty, so the edge can render null exactly as the old two-hop did (#256)")
				.isEmpty();
	}

	@Test
	void emailVerifiedForNormalizesTheEmail() {
		registeredId("alice@example.com");

		assertThat(service.emailVerifiedFor("  Alice@EXAMPLE.com ")) // byte-different input
				.contains(false);
	}

	@Test
	void verifyEmailWithUnknownTokenIsInvalidAndVerifiesNothing() {
		assertThat(service.verifyEmail("no-such-token")).isEqualTo(new VerifyEmailOutcome.InvalidOrExpired());
	}

	@Test
	void resetPasswordRedeemsTokenSingleUseAndSetsHash() {
		CustomerAccountId id = registeredId("reset@example.com");
		service.issuePasswordResetToken(id, "hash-r", FUTURE);

		ResetPasswordOutcome outcome = service.resetPassword("hash-r", "{bcrypt}new");

		assertThat(outcome).isEqualTo(new ResetPasswordOutcome.Reset(id, "reset@example.com"));
		assertThat(service.findByEmail("reset@example.com")).get()
				.extracting(CustomerAccountCredential::passwordHash).isEqualTo("{bcrypt}new");
		assertThat(service.resetPassword("hash-r", "{bcrypt}other"))
				.as("single-use: the reset token cannot be replayed")
				.isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);
	}

	@Test
	void issuingANewTokenInvalidatesThePriorUnconsumedOne() {
		CustomerAccountId id = registeredId("reissue@example.com");
		service.issuePasswordResetToken(id, "hash-old", FUTURE);
		service.issuePasswordResetToken(id, "hash-new", FUTURE);

		assertThat(service.resetPassword("hash-old", "{bcrypt}x"))
				.as("only the newest link works").isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);
		assertThat(service.resetPassword("hash-new", "{bcrypt}y"))
				.isEqualTo(new ResetPasswordOutcome.Reset(id, "reissue@example.com"));
	}

	@Test
	void aTokenOfAnErasedAccountRedeemsNothingAndNamesNoOne() {
		CustomerAccountId id = registeredId("erased@example.com");
		service.issuePasswordResetToken(id, "hash-e", FUTURE);
		service.issueEmailVerificationToken(id, "hash-v", FUTURE);
		store.erase("erased@example.com");

		assertThat(service.emailForResetToken("hash-e")).isEmpty();
		assertThat(service.resetPassword("hash-e", "{bcrypt}x")).isInstanceOf(ResetPasswordOutcome.InvalidOrExpired.class);
		assertThat(service.verifyEmail("hash-v")).isInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class);
		assertThat(tokens.accountFor(TokenPurpose.RESET_PASSWORD, "hash-e")).as("the lock refused before the consume")
				.contains(id);
	}

	@Test
	void anSsoSignInWhoseAccountIsErasedOnEveryAttemptGivesUp() {
		store.refusedLocks = 3;

		assertThrows(IllegalStateException.class,
				() -> service.resolveOrCreate(SsoProvider.GOOGLE, "g-erased", "erased-sso@example.com"));
	}

	@Test
	void anSsoSignInThatLosesItsSubjectAfterARetryDeletesTheAccountItCreated() {
		CustomerAccountId winner = registeredId("winner@example.com");
		store.subjectTakenOnFirstLinkBy = winner.value();

		assertThat(service.resolveOrCreate(SsoProvider.GOOGLE, "g-lost", "loser@example.com")).isEqualTo(winner);
		assertThat(service.accountFor("loser@example.com")).as("no stray account").isEmpty();
	}

	@Test
	void setPasswordGivesAPasswordlessSsoAccountItsFirstPassword() {
		CustomerAccountId id = service.resolveOrCreate(SsoProvider.GOOGLE, "g-x", "sso@example.com");
		assertThat(service.findByEmail("sso@example.com")).as("an SSO-only account has no password yet").isEmpty();

		assertThat(service.changePassword(id, null, "{bcrypt}first")).isTrue();

		assertThat(service.findByEmail("sso@example.com")).get()
				.extracting(CustomerAccountCredential::passwordHash).isEqualTo("{bcrypt}first"); // closes S4 F-1
	}

	@Test
	void aChangeOverAHashThatMovedOnWritesNothing() {
		CustomerAccountId id = registeredId("moved@example.com");

		assertThat(service.changePassword(id, "{bcrypt}stale", "{bcrypt}mine")).isFalse();
		assertThat(service.findByEmail("moved@example.com")).get()
				.extracting(CustomerAccountCredential::passwordHash).isEqualTo("{bcrypt}pw");
	}

	private CustomerAccountId registeredId(String email) {
		return ((RegistrationOutcome.Registered) service.register(email, "{bcrypt}pw")).accountId();
	}

	/** In-memory store mirroring the adapter's INSERT … ON CONFLICT DO NOTHING semantics. */
	private static final class FakeStore implements CustomerAccountStore {
		private final Map<String, CustomerAccountCredential> byEmail = new HashMap<>();
		private final Map<String, Long> idByEmail = new HashMap<>();
		private final Map<String, Long> accountBySsoIdentity = new HashMap<>();
		private final Set<Long> verified = new HashSet<>();
		private long nextId = 1;

		@Override
		public Optional<CustomerAccountCredential> findByEmail(String normalizedEmail) {
			return Optional.ofNullable(byEmail.get(normalizedEmail));
		}

		@Override
		public Optional<LiveAccountCredential> findLiveCredential(String normalizedEmail) {
			return Optional.ofNullable(idByEmail.get(normalizedEmail)).map(id -> new LiveAccountCredential(
					new CustomerAccountId(id), normalizedEmail, hashOf(normalizedEmail)));
		}

		@Override
		public Optional<LiveAccountCredential> findLiveCredential(CustomerAccountId accountId) {
			return idByEmail.entrySet().stream().filter(entry -> entry.getValue() == accountId.value()).findFirst()
					.flatMap(entry -> findLiveCredential(entry.getKey()));
		}

		@Override
		public Optional<CustomerAccountId> findIdByEmail(String normalizedEmail) {
			return Optional.ofNullable(idByEmail.get(normalizedEmail)).map(CustomerAccountId::new);
		}

		@Override
		public RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash) {
			if (byEmail.containsKey(normalizedEmail)) {
				return new RegistrationOutcome.AlreadyRegistered();
			}
			long id = nextId++;
			byEmail.put(normalizedEmail, new CustomerAccountCredential(normalizedEmail, passwordHash));
			idByEmail.put(normalizedEmail, id);
			return new RegistrationOutcome.Registered(new CustomerAccountId(id));
		}

		@Override
		public Optional<CustomerAccountId> accountForSsoIdentity(SsoProvider provider, String subject) {
			return Optional.ofNullable(accountBySsoIdentity.get(provider.name() + '|' + subject))
					.map(CustomerAccountId::new);
		}

		@Override
		public Optional<SsoAccountClaim> claimAccountForSso(String normalizedEmail) {
			boolean created = !idByEmail.containsKey(normalizedEmail);
			long accountId = idByEmail.computeIfAbsent(normalizedEmail, e -> nextId++);
			return Optional.of(new SsoAccountClaim(new CustomerAccountId(accountId), created));
		}

		@Override
		public Optional<CustomerAccountId> linkSsoIdentity(CustomerAccountId accountId, SsoProvider provider,
				String subject, String normalizedEmail) {
			if (subjectTakenOnFirstLinkBy != null) {
				accountBySsoIdentity.put(provider.name() + '|' + subject, subjectTakenOnFirstLinkBy);
				subjectTakenOnFirstLinkBy = null;
				return Optional.empty();
			}
			return Optional.of(new CustomerAccountId(
					accountBySsoIdentity.computeIfAbsent(provider.name() + '|' + subject, k -> accountId.value())));
		}

		@Override
		public void deleteUnlinkedAccount(CustomerAccountId accountId) {
			emailForId(accountId.value()).ifPresent(this::erase);
		}

		@Override
		public void markEmailVerified(CustomerAccountId accountId) {
			verified.add(accountId.value());
		}

		/** Locks refused as if an erasure committed between the claim and the lock. */
		private int refusedLocks;

		/** The winner's id when the first link loses its subject to it and finds that link gone, then back. */
		private Long subjectTakenOnFirstLinkBy;

		@Override
		public boolean lockLiveAccount(CustomerAccountId accountId) {
			if (refusedLocks > 0) {
				refusedLocks--;
				return false;
			}
			return idByEmail.containsValue(accountId.value());
		}

		@Override
		public boolean replacePasswordHash(CustomerAccountId accountId, String expectedHash, String passwordHash) {
			Optional<String> email = emailForId(accountId.value());
			if (email.isEmpty() || !java.util.Objects.equals(hashOf(email.get()), expectedHash)) {
				return false;
			}
			byEmail.put(email.get(), new CustomerAccountCredential(email.get(), passwordHash));
			return true;
		}

		private String hashOf(String email) {
			CustomerAccountCredential credential = byEmail.get(email);
			return credential == null ? null : credential.passwordHash();
		}

		@Override
		public void updatePasswordHash(CustomerAccountId accountId, String passwordHash) {
			emailForId(accountId.value()).ifPresent(
					email -> byEmail.put(email, new CustomerAccountCredential(email, passwordHash)));
		}

		@Override
		public Optional<Boolean> emailVerifiedFor(String normalizedEmail) {
			return Optional.ofNullable(idByEmail.get(normalizedEmail)).map(verified::contains);
		}

		@Override
		public String emailOf(CustomerAccountId accountId) {
			return emailForId(accountId.value()).orElseThrow();
		}

		/** The tombstone renames the email, so the erased account is found by neither its email nor its id. */
		void erase(String email) {
			idByEmail.remove(email);
			byEmail.remove(email);
		}

		private Optional<String> emailForId(long id) {
			return idByEmail.entrySet().stream()
					.filter(e -> e.getValue() == id).map(Map.Entry::getKey).findFirst();
		}
	}

	/** In-memory recovery-token store mirroring the adapter's single-use / invalidate-prior semantics. */
	private static final class FakeTokens implements ai.riviera.platform.customer.application.CustomerAccountTokens {
		private record Row(long accountId, TokenPurpose purpose, boolean consumed) {
		}

		private final Map<String, Row> byHash = new HashMap<>();

		@Override
		public void issue(CustomerAccountId accountId, TokenPurpose purpose, String tokenHash, Instant expiresAt) {
			byHash.replaceAll((h, r) -> r.accountId() == accountId.value() && r.purpose() == purpose && !r.consumed()
					? new Row(r.accountId(), r.purpose(), true)
					: r);
			byHash.put(tokenHash, new Row(accountId.value(), purpose, false));
		}

		@Override
		public void retireAll(CustomerAccountId accountId, TokenPurpose purpose) {
			byHash.replaceAll((h, r) -> r.accountId() == accountId.value() && r.purpose() == purpose
					? new Row(r.accountId(), r.purpose(), true)
					: r);
		}

		@Override
		public Optional<CustomerAccountId> consume(TokenPurpose purpose, String tokenHash) {
			Optional<CustomerAccountId> claimed = accountFor(purpose, tokenHash);
			claimed.ifPresent(id -> byHash.put(tokenHash, new Row(id.value(), purpose, true)));
			return claimed;
		}

		@Override
		public Optional<CustomerAccountId> accountFor(TokenPurpose purpose, String tokenHash) {
			Row r = byHash.get(tokenHash);
			if (r == null || r.consumed() || r.purpose() != purpose) {
				return Optional.empty();
			}
			return Optional.of(new CustomerAccountId(r.accountId()));
		}
	}
}
