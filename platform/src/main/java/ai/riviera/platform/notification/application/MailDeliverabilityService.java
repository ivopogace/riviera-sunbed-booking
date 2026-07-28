package ai.riviera.platform.notification.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.notification.api.MailDeliverability;

/**
 * Answers {@link MailDeliverability} from this module's own state (#400) — the same
 * {@link EmailSuppressions} lookup {@link TransactionalMailService} makes before every send, so the
 * claim a surface renders and the decision the send takes come from one list. Normalization and
 * hashing stay in the adapter, which owns that key's input contract (#386/#388).
 *
 * <p><strong>Degrades rather than fails, and does so wider than the send path.</strong> Every
 * {@link RuntimeException} reports "not withheld", where {@code TransactionalMailService}'s fail-open
 * carve-out is deliberately narrowed to <em>transient</em> failures. The asymmetry is the difference
 * in stake, not an oversight: there, failing open on a structurally broken lookup would mail every
 * suppressed address indefinitely; here the worst case is one advisory sentence too few, against a
 * caller mid-request whose alternative is a {@code 500} on a flow that already did its real work.
 *
 * <p>An explicit fault barrier, and so a <strong>documented deviation</strong> from the
 * catch-narrowly convention ({@code riviera-java-conventions} §6) — the same call #390 made on
 * {@code SuppressedConfirmationMailDelivery} after review finding F-2 found non-{@link
 * DataAccessException} throwers reaching a caller that could not act on them. The barrier lives here,
 * where the port's total contract is declared, rather than being restated at each call site. The
 * exception is passed to the logger so the programming errors it newly swallows stay diagnosable
 * (#390 G-7).
 *
 * <p>Consequently the surface's claim and the send decision <em>can</em> diverge on a failing lookup
 * — the send is dropped by its outer catch while this reports deliverable. Accepted: the alternative
 * is failing a request whose only job is to say what happened.
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
