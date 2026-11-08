package ai.riviera.platform.payment.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** The reconciliation's reads of the {@code payment} table; it writes through {@link VerifiedPaymentOutcomes} alone. */
public interface ReconcilablePayments {

	/** One keyset page of the open rows created in {@code [from, before)} with an id above {@code afterId}, by id. */
	List<ReconcilablePayment> findOpenCreatedBetween(Instant from, Instant before, long afterId, int limit);

	/** The row with this id, whatever its status. */
	Optional<ReconcilablePayment> findById(long paymentId);

	/** Those of {@code references} that a {@code payment} row exists for. */
	Set<String> knownReferences(Collection<String> references);
}
