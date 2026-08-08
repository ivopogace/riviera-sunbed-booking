package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for the GDPR right-to-erasure outcome logic, against a hand fake of the
 * {@link AccountErasureStore} port (no Spring, no DB). The real tombstone SQL, the RESTRICT-FK survival
 * of retained booking/payment/payout rows, the SSO/token child deletes, and tombstone-email uniqueness
 * are proven separately by {@code AccountErasureIT}.
 */
class AccountErasureServiceTest {

	private final FakeErasureStore store = new FakeErasureStore();
	private final AccountErasureService service = new AccountErasureService(store);

	@Test
	void eraseAccountScrubsTheAccountAndItsMatchingGuestContact() {
		CustomerAccountId id = store.account("alice@example.com");
		store.guest("alice@example.com");

		EraseOutcome outcome = service.eraseAccount(id);

		assertThat(outcome).isEqualTo(EraseOutcome.ERASED);
		assertThat(store.accountErased(id)).isTrue();
		assertThat(store.guestErased("alice@example.com")).isTrue();
	}

	@Test
	void eraseAccountWithNoMatchingGuestStillErasesTheAccount() {
		CustomerAccountId id = store.account("bob@example.com"); // no guest row for bob

		assertThat(service.eraseAccount(id)).isEqualTo(EraseOutcome.ERASED);
		assertThat(store.accountErased(id)).isTrue();
	}

	@Test
	void eraseAccountIsIdempotent() {
		CustomerAccountId id = store.account("carol@example.com");
		assertThat(service.eraseAccount(id)).isEqualTo(EraseOutcome.ERASED);

		assertThat(service.eraseAccount(id))
				.as("a second erasure of an already-tombstoned account is a no-op")
				.isEqualTo(EraseOutcome.ALREADY_ERASED);
	}

	@Test
	void eraseAccountUnknownIdReturnsNotFound() {
		assertThat(service.eraseAccount(new CustomerAccountId(999))).isEqualTo(EraseOutcome.NOT_FOUND);
	}

	@Test
	void eraseByEmailScrubsAccountAndGuestSharingTheEmailCaseInsensitively() {
		CustomerAccountId id = store.account("dana@example.com");
		store.guest("dana@example.com");

		EraseOutcome outcome = service.eraseByEmail("  DANA@Example.com  "); // normalized to the stored key

		assertThat(outcome).isEqualTo(EraseOutcome.ERASED);
		assertThat(store.accountErased(id)).isTrue();
		assertThat(store.guestErased("dana@example.com")).isTrue();
	}

	@Test
	void eraseByEmailWithNothingToEraseReturnsNotFound() {
		assertThat(service.eraseByEmail("nobody@example.com")).isEqualTo(EraseOutcome.NOT_FOUND);
	}

	/**
	 * In-memory store mirroring the adapter: {@code eraseAccountById}/{@code eraseAccountByEmail} tombstone a
	 * live account (and its children); {@code eraseGuestByEmail} tombstones a live guest keyed by its email.
	 * Erased rows are flagged, not removed — a re-erase of a flagged row is a no-op (mirrors {@code erased_at
	 * IS NULL} guards).
	 */
	private static final class FakeErasureStore implements AccountErasureStore {
		private final Map<Long, String> accountEmail = new HashMap<>();
		private final Map<Long, Boolean> accountErased = new HashMap<>();
		private final Map<String, Boolean> guestErased = new HashMap<>();
		private long nextId = 1;

		CustomerAccountId account(String email) {
			long id = nextId++;
			accountEmail.put(id, email);
			accountErased.put(id, false);
			return new CustomerAccountId(id);
		}

		void guest(String email) {
			guestErased.put(email, false);
		}

		boolean accountErased(CustomerAccountId id) {
			return Boolean.TRUE.equals(accountErased.get(id.value()));
		}

		boolean guestErased(String email) {
			return Boolean.TRUE.equals(guestErased.get(email));
		}

		@Override
		public Optional<String> emailOfAccount(CustomerAccountId accountId) {
			return Optional.ofNullable(accountEmail.get(accountId.value()));
		}

		@Override
		public boolean eraseAccountById(CustomerAccountId accountId) {
			if (!accountErased.containsKey(accountId.value()) || accountErased.get(accountId.value())) {
				return false;
			}
			accountErased.put(accountId.value(), true);
			return true;
		}

		@Override
		public boolean eraseAccountByEmail(String normalizedEmail) {
			return accountEmail.entrySet().stream()
					.filter(e -> e.getValue().equals(normalizedEmail) && !accountErased.get(e.getKey()))
					.findFirst()
					.map(e -> eraseAccountById(new CustomerAccountId(e.getKey())))
					.orElse(false);
		}

		@Override
		public int eraseGuestByEmail(String normalizedEmail) {
			if (!guestErased.containsKey(normalizedEmail) || guestErased.get(normalizedEmail)) {
				return 0;
			}
			guestErased.put(normalizedEmail, true);
			return 1;
		}

		@Override
		public List<CustomerId> expiredGuestCandidates(Instant olderThan, int limit) {
			throw new UnsupportedOperationException("retention sweep — see ExpireGuestContactsServiceTest");
		}

		@Override
		public boolean eraseGuestById(CustomerId guestId) {
			throw new UnsupportedOperationException("retention sweep — see ExpireGuestContactsServiceTest");
		}
	}
}
