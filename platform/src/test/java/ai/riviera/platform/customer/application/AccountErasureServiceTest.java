package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.spi.ReviewErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for the GDPR right-to-erasure outcome logic, against hand fakes of the
 * {@link AccountErasureStore} and {@link ReviewErasure} ports (no Spring, no DB). The real tombstone
 * SQL, the RESTRICT-FK survival of retained booking/payment/payout rows, the SSO/token child deletes,
 * tombstone-email uniqueness and the review tombstone itself are proven separately by
 * {@code AccountErasureIT}.
 */
class AccountErasureServiceTest {

	private final FakeErasureStore store = new FakeErasureStore();
	private final FakeReviewErasure reviews = new FakeReviewErasure();
	private final AccountErasureService service = new AccountErasureService(store, reviews);

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
		assertThat(reviews.accountsReached()).isEmpty();
		assertThat(reviews.guestBatches()).isEmpty();
	}

	@Test
	void eraseAccountReachesReviewsOfBothSubjectsAndIsIdempotent() {
		CustomerAccountId id = store.account("erin@example.com");
		CustomerId guest = store.guest("erin@example.com");

		assertThat(service.eraseAccount(id)).isEqualTo(EraseOutcome.ERASED);
		assertThat(reviews.accountsReached()).containsExactly(id);
		assertThat(reviews.guestBatches()).containsExactly(List.of(guest));

		reviews.reviewsLeftOnAccount(1); // a review the subject wrote after the first erasure
		assertThat(service.eraseAccount(id))
				.as("a review written since is still the subject's PII, so re-erasure changes something")
				.isEqualTo(EraseOutcome.ERASED);
		assertThat(service.eraseAccount(id)).isEqualTo(EraseOutcome.ALREADY_ERASED);

		assertThat(reviews.accountsReached()).as("the account's reviews are reached on every call")
				.containsExactly(id, id, id);
		assertThat(reviews.guestBatches()).as("never asked with an empty guest list")
				.containsExactly(List.of(guest));
	}

	@Test
	void eraseByEmailReachesTheGuestsAndTheAccountsReviews() {
		CustomerAccountId id = store.account("finn@example.com");
		CustomerId guest = store.guest("finn@example.com");

		assertThat(service.eraseByEmail("finn@example.com")).isEqualTo(EraseOutcome.ERASED);

		assertThat(reviews.accountsReached()).containsExactly(id);
		assertThat(reviews.guestBatches()).containsExactly(List.of(guest));
	}

	/**
	 * In-memory store mirroring the adapter: {@code eraseAccountById}/{@code eraseAccountByEmail} tombstone a
	 * live account (and its children); {@code eraseGuestByEmail} tombstones a live guest keyed by its email
	 * and answers its id. Erased rows are flagged, not removed — a re-erase of a flagged row is a no-op
	 * (mirrors {@code erased_at IS NULL} guards).
	 */
	private static final class FakeErasureStore implements AccountErasureStore {
		private final Map<Long, String> accountEmail = new HashMap<>();
		private final Map<Long, Boolean> accountErased = new HashMap<>();
		private final Map<String, CustomerId> guestIds = new HashMap<>();
		private final Map<String, Boolean> guestErased = new HashMap<>();
		private long nextId = 1;

		CustomerAccountId account(String email) {
			long id = nextId++;
			accountEmail.put(id, email);
			accountErased.put(id, false);
			return new CustomerAccountId(id);
		}

		CustomerId guest(String email) {
			CustomerId id = new CustomerId(nextId++);
			guestIds.put(email, id);
			guestErased.put(email, false);
			return id;
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
		public Optional<CustomerAccountId> eraseAccountByEmail(String normalizedEmail) {
			return accountEmail.entrySet().stream()
					.filter(e -> e.getValue().equals(normalizedEmail) && !accountErased.get(e.getKey()))
					.findFirst()
					.map(e -> new CustomerAccountId(e.getKey()))
					.filter(this::eraseAccountById);
		}

		@Override
		public List<CustomerId> eraseGuestByEmail(String normalizedEmail) {
			if (!guestErased.containsKey(normalizedEmail) || guestErased.get(normalizedEmail)) {
				return List.of();
			}
			guestErased.put(normalizedEmail, true);
			return List.of(guestIds.get(normalizedEmail));
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

	/**
	 * Records every reach into reviews; answers the count it was told is left to scrub on the account
	 * (default none), so the spec can stage "a review written after the erasure".
	 */
	private static final class FakeReviewErasure implements ReviewErasure {
		private final List<CustomerAccountId> accountsReached = new ArrayList<>();
		private final List<List<CustomerId>> guestBatches = new ArrayList<>();
		private int reviewsLeftOnAccount;

		List<CustomerAccountId> accountsReached() {
			return accountsReached;
		}

		List<List<CustomerId>> guestBatches() {
			return guestBatches;
		}

		void reviewsLeftOnAccount(int count) {
			reviewsLeftOnAccount = count;
		}

		@Override
		public int eraseForGuests(Collection<CustomerId> guests) {
			guestBatches.add(List.copyOf(guests));
			return guests.size();
		}

		@Override
		public int eraseForAccount(CustomerAccountId account) {
			accountsReached.add(account);
			int scrubbed = reviewsLeftOnAccount;
			reviewsLeftOnAccount = 0;
			return scrubbed;
		}
	}
}
