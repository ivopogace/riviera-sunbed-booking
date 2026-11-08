package ai.riviera.platform.payment.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/**
 * One {@code payment} row as the reconciliation reads it. {@code payee} is empty on a row predating V80, which the
 * sweep reports and never looks up: a venue is never assumed (#1690).
 */
public record ReconcilablePayment(long id, String reference, PaymentStatus status, Optional<PayeeRef> payee,
		List<BookingRef> bookings) {
}
