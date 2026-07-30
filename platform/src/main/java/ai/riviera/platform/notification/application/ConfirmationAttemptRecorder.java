package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Writes one booking-confirmation mail attempt to the delivery log (#380), stamping the clock and
 * absorbing a failure of the write itself. Both writers go through here — the registry listener and
 * the admin resend — so the policy below is stated once rather than copied into two call sites.
 *
 * <p><strong>The write is best-effort relative to the send it describes, and that asymmetry is the
 * point.</strong> By the time this is called the mail has already been handed to the transport (or
 * deliberately withheld); the only thing left to lose is the evidence. Propagating a failed insert
 * from the automatic path would instead abort a listener that had already sent, leaving the
 * publication outstanding and duplicating the mail on the registry's next retry — trading a missing
 * history row for a second mail to the tourist. So a failed write costs a row and a {@code WARN},
 * and the admin view then reads "no attempts recorded", which is honest about what it knows.
 *
 * <p>Nothing branches on this log (see {@link ConfirmationMailAttempts}), so swallowing here cannot
 * change a delivery decision — the usual objection to a swallowed write does not reach it. The catch
 * is {@link DataAccessException}, not {@code RuntimeException}: a programming error in the mapping
 * above it is not something to absorb (`riviera-java-conventions` §6).
 */
@Service
public class ConfirmationAttemptRecorder {

	private static final Logger log = LoggerFactory.getLogger(ConfirmationAttemptRecorder.class);

	private final ConfirmationMailAttempts attempts;
	private final Clock clock;

	ConfirmationAttemptRecorder(ConfirmationMailAttempts attempts, Clock clock) {
		this.attempts = attempts;
		this.clock = clock;
	}

	/**
	 * Record what became of one attempt. Never throws: see the class Javadoc for why the evidence is
	 * the thing that gives way.
	 */
	public void record(BookingId bookingId, MailAttemptSource source, MailAttemptOutcome outcome) {
		try {
			attempts.append(new MailAttempt(bookingId, source, outcome, clock.instant()));
		}
		catch (DataAccessException e) {
			// Ids and tokens only — never the address, never the arrival code (invariant #7).
			log.warn("Could not record the {} confirmation-mail attempt ({}) for booking {}; the mail "
					+ "itself is unaffected, but its delivery history will not show this attempt",
					source, outcome, bookingId.value(), e);
		}
	}
}
