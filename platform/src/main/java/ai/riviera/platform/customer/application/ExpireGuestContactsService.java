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
 * The {@code customer} module's retention-sweep application service (Slice 2 of #101). Package-private
 * behind the internal {@link ExpireGuestContacts} port; constructor injection into {@code final} fields.
 *
 * <p>A guest contact is scrubbed only when <strong>all three</strong> gates agree it has no live basis:
 * the row itself is older than the window and no live {@code customer_account} claims its email (both
 * applied by the candidate query, in SQL), and no booking of that guest falls on or after the cutoff (the
 * dependency-inverted {@link GuestBookingHistory} fact, answered by {@code booking}). The window and the
 * decision are {@code customer}'s; {@code booking} holds no retention policy. The contacts a run scrubs
 * have their reviews tombstoned in the same transaction through {@link ReviewErasure}, one call per batch.
 *
 * <p>The cutoff is a civil date reasoned in {@code Europe/Tirane} from the injected UTC {@link Clock}
 * (invariant #6) — never the JVM default zone. The boundary is <em>inclusive-retain</em>: a booking exactly
 * on the cutoff still counts as a basis.
 *
 * <p>The run is bounded by {@link RetentionWindow#batchSize()} so a backlog can never produce an unbounded
 * transaction; the remainder is picked up by the next run. Each scrub is guarded on {@code erased_at IS
 * NULL}, so a repeated run — or an overlap with a Slice-1 erasure of the same row — is a no-op rather than
 * a double-erasure. Financial records are never touched (invariant #9). The completion is logged with
 * counts and the cutoff date only — never an email, name, phone, or booking code (invariant #7,
 * {@code riviera-java-conventions} §10).
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
