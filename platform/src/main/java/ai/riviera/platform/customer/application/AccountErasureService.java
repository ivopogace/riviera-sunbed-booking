package ai.riviera.platform.customer.application;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.spi.ReviewErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

/**
 * {@code customer}'s right-to-erasure service behind the {@link AccountErasure} port (#11). One
 * {@code @Transactional} unit: a partial erasure (account tombstoned, children or reviews left
 * behind) must never commit. Reads the account's email <em>before</em> the scrub tombstones it,
 * scrubs guest contacts sharing it, then the subject's reviews via {@link ReviewErasure} (by
 * account id plus any guest ids returned). No Spring Security type (the edge authenticates and
 * revokes sessions); logs only ids, counts, outcome, never email, name, phone, booking code (#7).
 */
@Service
class AccountErasureService implements AccountErasure {

	private static final Logger log = LoggerFactory.getLogger(AccountErasureService.class);

	private final AccountErasureStore store;
	private final ReviewErasure reviews;

	AccountErasureService(AccountErasureStore store, ReviewErasure reviews) {
		this.store = store;
		this.reviews = reviews;
	}

	@Override
	@Transactional
	public EraseOutcome eraseAccount(CustomerAccountId accountId) {
		Optional<String> email = store.emailOfAccount(accountId);
		if (email.isEmpty()) {
			log.info("customer account erasure outcome={} accountId={}", EraseOutcome.NOT_FOUND, accountId.value());
			return EraseOutcome.NOT_FOUND;
		}
		boolean accountScrubbed = store.eraseAccountById(accountId);
		List<CustomerId> guests = store.eraseGuestByEmail(email.get());
		int reviewsScrubbed = reviews.eraseForAccount(accountId) + eraseReviewsOf(guests);
		EraseOutcome outcome = accountScrubbed || !guests.isEmpty() || reviewsScrubbed > 0
				? EraseOutcome.ERASED
				: EraseOutcome.ALREADY_ERASED;
		log.info("customer account erasure outcome={} accountId={} scrubbedGuests={} scrubbedReviews={}",
				outcome, accountId.value(), guests.size(), reviewsScrubbed);
		return outcome;
	}

	@Override
	@Transactional
	public EraseOutcome eraseByEmail(String email) {
		String normalized = Emails.normalize(email);
		Optional<CustomerAccountId> account = store.eraseAccountByEmail(normalized);
		List<CustomerId> guests = store.eraseGuestByEmail(normalized);
		int reviewsScrubbed = account.map(reviews::eraseForAccount).orElse(0) + eraseReviewsOf(guests);
		EraseOutcome outcome = account.isPresent() || !guests.isEmpty() ? EraseOutcome.ERASED : EraseOutcome.NOT_FOUND;
		log.info("customer erasure by admin outcome={} scrubbedAccount={} scrubbedGuests={} scrubbedReviews={}",
				outcome, account.isPresent(), guests.size(), reviewsScrubbed);
		return outcome;
	}

	private int eraseReviewsOf(List<CustomerId> guests) {
		return guests.isEmpty() ? 0 : reviews.eraseForGuests(guests);
	}

}
