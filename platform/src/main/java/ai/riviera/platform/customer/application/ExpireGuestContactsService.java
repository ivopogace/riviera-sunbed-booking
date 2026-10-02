package ai.riviera.platform.customer.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.spi.ReviewErasure;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The retention sweep. A guest contact is scrubbed only when <strong>all three</strong> gates agree: row older
 * than the window and email unclaimed by a live account (both in SQL), and no booking on or after the cutoff
 * ({@link GuestBookingHistory}); its reviews are tombstoned in the same transaction ({@link ReviewErasure}). The
 * cutoff is a {@code Europe/Tirane} date from the UTC {@link Clock} (#6), inclusive-retain. A run walks candidates
 * by id past kept ones until it scrubs {@link RetentionWindow#batchSize()} (#1293), never touches financial rows
 * (#9) and logs counts and the cutoff only (#7). Gates: {@code docs/runbooks/data-erasure.md}.
 */
@Service
class ExpireGuestContactsService implements ExpireGuestContacts {

	private static final Logger log = LoggerFactory.getLogger(ExpireGuestContactsService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	/** The keyset walk's start: below every {@code customer.id}. */
	private static final CustomerId BEFORE_FIRST_ID = new CustomerId(0);

	private final AccountErasureStore store;
	private final GuestBookingHistory history;
	private final ReviewErasure reviews;
	private final RetentionWindow retention;
	private final Clock clock;

	ExpireGuestContactsService(AccountErasureStore store, GuestBookingHistory history, ReviewErasure reviews,
			RetentionWindow retention, Clock clock) {
		this.store = store;
		this.history = history;
		this.reviews = reviews;
		this.retention = retention;
		this.clock = clock;
	}

	@Override
	@Transactional
	public int sweep() {
		LocalDate cutoff = LocalDate.now(clock.withZone(TIRANE)).minus(retention.window());
		Instant olderThan = cutoff.atStartOfDay(TIRANE).toInstant();
		int budget = retention.batchSize();
		List<CustomerId> scrubbed = new ArrayList<>();
		CustomerId after = BEFORE_FIRST_ID;
		while (scrubbed.size() < budget) {
			List<CustomerId> page = store.expiredGuestCandidates(olderThan, after, budget);
			if (page.isEmpty()) {
				break;
			}
			scrubPage(page, cutoff, olderThan, budget, scrubbed);
			after = page.getLast();
		}
		if (scrubbed.isEmpty()) {
			return 0;
		}
		int reviewsScrubbed = reviews.eraseForGuests(scrubbed);
		log.info("retention sweep scrubbed {} expired guest contact(s) and {} review(s) with cutoff {}",
				scrubbed.size(), reviewsScrubbed, cutoff);
		return scrubbed.size();
	}

	/** Scrubs the page's contacts no booking keeps, in id order, until {@code scrubbed} holds {@code budget}. */
	private void scrubPage(List<CustomerId> page, LocalDate cutoff, Instant olderThan, int budget,
			List<CustomerId> scrubbed) {
		Set<CustomerId> stillInBasis = history.withBookingOnOrAfter(page, cutoff);
		for (CustomerId candidate : page) {
			if (scrubbed.size() == budget) {
				return;
			}
			if (!stillInBasis.contains(candidate) && store.eraseGuestById(candidate, olderThan)) {
				scrubbed.add(candidate);
			}
		}
	}
}
