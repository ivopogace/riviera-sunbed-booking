package ai.riviera.platform.payment.application;

import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/**
 * One comparison of the open {@code payment} rows with the provider. Ids only (invariant #7). {@code unchecked} rows
 * and an unavailable listing are what the comparison could not answer, so a report holding them is not clean.
 */
public record ReconciliationReport(List<Divergence> divergences, List<String> orphans, List<Unchecked> unchecked,
		OrphanListing orphanListing) {

	/** What the provider says against a row still waiting here. */
	public enum Kind {
		PAID_LOCALLY_WAITING, CANCELED_LOCALLY_WAITING
	}

	/** Whether the provider's unpaid transactions could be read: {@link #NOT_OFFERED} has none to read. */
	public enum OrphanListing {
		LISTED, NOT_OFFERED, UNAVAILABLE
	}

	public record Divergence(Kind kind, long paymentId, String reference, PayeeRef payee, List<BookingRef> bookings) {
	}

	public record Unchecked(long paymentId, String reference, String reason) {
	}

	/** Whether there is nothing for anyone to look at. */
	public boolean isClean() {
		return divergences.isEmpty() && orphans.isEmpty() && unchecked.isEmpty()
				&& orphanListing != OrphanListing.UNAVAILABLE;
	}
}
