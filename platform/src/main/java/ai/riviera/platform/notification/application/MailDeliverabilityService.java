package ai.riviera.platform.notification.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.notification.api.MailDeliverability;

/**
 * Answers {@link MailDeliverability} from the {@link EmailSuppressions} lookup that
 * {@link TransactionalMailService} makes before every send, so a surface's claim and the send read one
 * list; the adapter normalizes and hashes the key. A deliberate fault barrier, deviating from
 * catch-narrowly ({@code riviera-java-conventions} §6): any {@link RuntimeException}, not just
 * {@link DataAccessException}, reports "not withheld" and is logged with its exception. Deliberately
 * wider than the send path's transient-only fail-open: the worst case here is one advisory sentence.
 */
@Service
class MailDeliverabilityService implements MailDeliverability {

	private static final Logger log = LoggerFactory.getLogger(MailDeliverabilityService.class);

	private final EmailSuppressions suppressions;

	MailDeliverabilityService(EmailSuppressions suppressions) {
		this.suppressions = suppressions;
	}

	@Override
	public boolean isWithheld(String toEmail) {
		try {
			return suppressions.isSuppressed(toEmail);
		}
		catch (RuntimeException e) {
			// No address in the line (the module's PII posture); the correlation id rides the MDC.
			log.warn("Suppression lookup failed for a deliverability question; reporting deliverable", e);
			return false;
		}
	}
}
