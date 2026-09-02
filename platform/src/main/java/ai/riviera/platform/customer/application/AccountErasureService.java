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
 * The {@code customer} module's right-to-erasure application service. Package-private
 * behind the published {@link AccountErasure} port (invariant #11); constructor injection into
 * {@code final} ports. The scrub is one {@code @Transactional} unit — a partial erasure (account
 * tombstoned but its children, or its reviews, left behind) must never commit.
 *
 * <p>It reads the account's email <em>before</em> the account scrub tombstones it, scrubs any guest
 * contact sharing that email, then reaches the subject's reviews through {@link ReviewErasure} — by
 * the account id on every call, and by the guest ids the tombstone just returned when there were any.
 * Holds no Spring Security type (RV-BE-11); authentication + session revocation stay at the platform
 * edge. The completion is recorded with the shipped structured logger carrying only technical ids,
 * counts and the outcome — never the email, name, phone, or a booking code (invariant #7,
 * {@code riviera-java-conventions} §10).
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
