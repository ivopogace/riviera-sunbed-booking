package ai.riviera.platform.customer.application;

import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

/**
 * The {@code customer} module's right-to-erasure application service (Slice 1 of #101). Package-private
 * behind the published {@link AccountErasure} port (invariant #11); constructor injection into a
 * {@code final} {@link AccountErasureStore}. The scrub is one {@code @Transactional} unit — a partial
 * erasure (account tombstoned but its children left behind) must never commit.
 *
 * <p>It reads the account's email <em>before</em> the account scrub tombstones it, then scrubs any guest
 * contact sharing that email. Holds no Spring Security type (RV-BE-11); authentication + session
 * revocation stay at the platform edge. The completion is recorded with the shipped structured logger
 * (#100) carrying only technical ids + the outcome — never the email, name, phone, or a booking code
 * (invariant #7, {@code riviera-java-conventions} §10).
 */
@Service
class AccountErasureService implements AccountErasure {

	private static final Logger log = LoggerFactory.getLogger(AccountErasureService.class);

	private final AccountErasureStore store;

	AccountErasureService(AccountErasureStore store) {
		this.store = store;
	}

	@Override
	@Transactional
	public EraseOutcome eraseAccount(CustomerAccountId accountId) {
		Optional<String> email = store.emailOfAccount(accountId);
		if (email.isEmpty()) {
			return logged(EraseOutcome.NOT_FOUND, accountId);
		}
		boolean accountScrubbed = store.eraseAccountById(accountId);
		int guestsScrubbed = store.eraseGuestByEmail(email.get());
		return logged(accountScrubbed || guestsScrubbed > 0 ? EraseOutcome.ERASED : EraseOutcome.ALREADY_ERASED,
				accountId);
	}

	@Override
	@Transactional
	public EraseOutcome eraseByEmail(String email) {
		String normalized = normalize(email);
		boolean accountScrubbed = store.eraseAccountByEmail(normalized);
		int guestsScrubbed = store.eraseGuestByEmail(normalized);
		EraseOutcome outcome = accountScrubbed || guestsScrubbed > 0 ? EraseOutcome.ERASED : EraseOutcome.NOT_FOUND;
		log.info("customer erasure by admin outcome={} scrubbedAccount={} scrubbedGuests={}",
				outcome, accountScrubbed, guestsScrubbed);
		return outcome;
	}

	private static EraseOutcome logged(EraseOutcome outcome, CustomerAccountId accountId) {
		log.info("customer account erasure outcome={} accountId={}", outcome, accountId.value());
		return outcome;
	}

	private static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
