package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Writes one booking-confirmation mail attempt to the delivery log, stamping the clock and
 * absorbing a failure of the write; both writers (registry listener, admin resend) use it.
 *
 * <p><strong>Best-effort relative to the send it records:</strong> the mail is already sent or
 * withheld, so a thrown insert would abort the listener and re-send the mail on the registry's
 * retry; a failed write costs a row and a {@code WARN}. Nothing branches on the log
 * ({@link ConfirmationMailAttempts}); only {@link DataAccessException} is absorbed, never a bug.
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
	 * Record what became of one attempt. A failed write is logged, never thrown: see the class
	 * Javadoc for why the evidence is the thing that gives way.
	 */
	public void recordAttempt(BookingId bookingId, MailAttemptSource source, MailAttemptOutcome outcome) {
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
