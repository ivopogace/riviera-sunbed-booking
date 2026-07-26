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
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

import static org.assertj.core.api.Assertions.assertThat;

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
		assertThat(service.isEmailVerified(id)).isFalse();

		VerifyEmailOutcome outcome = service.verifyEmail("hash-v");

		assertThat(outcome).isEqualTo(new VerifyEmailOutcome.Verified(id));
		assertThat(service.isEmailVerified(id)).isTrue();
		assertThat(service.verifyEmail("hash-v"))
				.as("single-use: a second redemption of the same token fails")
				.isInstanceOf(VerifyEmailOutcome.InvalidOrExpired.class);
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
	void setPasswordGivesAPasswordlessSsoAccountItsFirstPassword() {
		CustomerAccountId id = service.resolveOrCreate(SsoProvider.GOOGLE, "g-x", "sso@example.com");
		assertThat(service.findByEmail("sso@example.com")).as("an SSO-only account has no password yet").isEmpty();

		service.setPassword(id, "{bcrypt}first");

		assertThat(service.findByEmail("sso@example.com")).get()
				.extracting(CustomerAccountCredential::passwordHash).isEqualTo("{bcrypt}first"); // closes S4 F-1
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
		public CustomerAccountId resolveSsoAccount(SsoProvider provider, String subject, String normalizedEmail) {
			Long existing = accountBySsoIdentity.get(provider.name() + '|' + subject);
			if (existing != null) {
				return new CustomerAccountId(existing);
			}
			// find-or-create by email (auto-link); an SSO-only account gets an id but no password credential.
			long accountId = idByEmail.computeIfAbsent(normalizedEmail, e -> nextId++);
			accountBySsoIdentity.put(provider.name() + '|' + subject, accountId);
			verified.add(accountId); // SSO email is provider-verified (design D-6)
			return new CustomerAccountId(accountId);
		}

		@Override
		public void markEmailVerified(CustomerAccountId accountId) {
			verified.add(accountId.value());
		}

		@Override
		public void updatePasswordHash(CustomerAccountId accountId, String passwordHash) {
			emailForId(accountId.value()).ifPresent(
					email -> byEmail.put(email, new CustomerAccountCredential(email, passwordHash)));
		}

		@Override
		public boolean isEmailVerified(CustomerAccountId accountId) {
			return verified.contains(accountId.value());
		}

		@Override
		public String emailOf(CustomerAccountId accountId) {
			return emailForId(accountId.value()).orElseThrow();
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
