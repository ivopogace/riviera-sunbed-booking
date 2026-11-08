package ai.riviera.platform.payment.application;

import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/**
 * The data needed to persist a brand-new collection in {@code REQUIRES_PAYMENT}: the venue it pays, the
 * {@code instruction} the browser gets (its reference is what the webhook looks up; never card data), the
 * ISO currency, and one {@link Share} per booking collected for, in integer minor units (invariants #5,
 * #11). A stay is a group of bookings paid once, so a collection may carry several shares. A driven-port
 * DTO, not exposed beyond {@code payment}.
 */
public record NewPayment(PayeeRef payee, CheckoutInstruction instruction, String currency, List<Share> shares) {

	/** One booking's part of the collection. */
	public record Share(BookingRef bookingRef, long amountMinor) {
	}

	public NewPayment {
		shares = List.copyOf(shares);
		if (shares.isEmpty()) {
			throw new IllegalArgumentException("a collection is for at least one booking");
		}
	}

	/** A collection for one booking whose share is the whole amount, paid in an embedded form. */
	public NewPayment(PayeeRef payee, BookingRef bookingRef, String reference, long amountMinor,
			String currency, String clientToken) {
		this(payee, new CheckoutInstruction.Embedded(clientToken, reference), currency,
				List.of(new Share(bookingRef, amountMinor)));
	}

	/** The provider's handle for this collection. */
	public String reference() {
		return instruction.reference();
	}

	/** The collection's total: the sum of its shares. */
	public long amountMinor() {
		return shares.stream().mapToLong(Share::amountMinor).sum();
	}
}
