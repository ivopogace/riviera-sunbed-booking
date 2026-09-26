package ai.riviera.platform.customer.application;

import java.time.Clock;
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
 * The retention sweep. A guest contact is scrubbed only when <strong>all three</strong> gates agree:
 * row older than the window and email unclaimed by a live account (both in SQL), and no booking on or
 * after the cutoff ({@link GuestBookingHistory}); its reviews are tombstoned in the same transaction via
 * {@link ReviewErasure}. The cutoff is a {@code Europe/Tirane} date from the UTC {@link Clock} (#6),
 * inclusive-retain. A run scrubs at most {@link RetentionWindow#batchSize()}, never touches financial
 * rows (#9), and logs counts and the cutoff only (#7). Gates: {@code docs/runbooks/data-erasure.md}.
 */
@Service
class ExpireGuestContactsService implements ExpireGuestContacts {

	private static final Logger log = LoggerFactory.getLogger(ExpireGuestContactsService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

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
		List<CustomerId> candidates =
				store.expiredGuestCandidates(cutoff.atStartOfDay(TIRANE).toInstant(), retention.batchSize());
		if (candidates.isEmpty()) {
			return 0;
		}
		Set<CustomerId> stillInBasis = history.withBookingOnOrAfter(candidates, cutoff);
		List<CustomerId> scrubbed = new ArrayList<>();
		for (CustomerId candidate : candidates) {
			if (!stillInBasis.contains(candidate) && store.eraseGuestById(candidate)) {
				scrubbed.add(candidate);
			}
		}
		if (scrubbed.isEmpty()) {
			return 0;
		}
		int reviewsScrubbed = reviews.eraseForGuests(scrubbed);
		log.info("retention sweep scrubbed {} expired guest contact(s) and {} review(s) with cutoff {}",
				scrubbed.size(), reviewsScrubbed, cutoff);
		return scrubbed.size();
	}
}
