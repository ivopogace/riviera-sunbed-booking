package ai.riviera.platform.customer.application;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for the account service's email normalization + non-enumerating registration, against a
 * hand fake of the storage port (no Spring, no DB). The real {@code ON CONFLICT} race-safety and the
 * UNIQUE constraint are proven separately by {@code JdbcCustomerAccountsIT}.
 */
class CustomerAccountServiceTest {

	private final FakeStore store = new FakeStore();
	private final CustomerAccountService service = new CustomerAccountService(store);

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

	/** In-memory store mirroring the adapter's INSERT … ON CONFLICT DO NOTHING semantics. */
	private static final class FakeStore implements CustomerAccountStore {
		private final Map<String, CustomerAccountCredential> byEmail = new HashMap<>();
		private final Map<String, Long> idByEmail = new HashMap<>();
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
	}
}
