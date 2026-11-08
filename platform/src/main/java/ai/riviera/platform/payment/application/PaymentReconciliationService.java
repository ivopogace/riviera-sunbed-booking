package ai.riviera.platform.payment.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.Kind;
import ai.riviera.platform.payment.application.ReconciliationReport.OrphanListing;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/**
 * Implements {@link PaymentReconciliation}. Holds no state and no transaction: each provider read runs outside one,
 * and the only write is {@link VerifiedPaymentOutcomes}'s guarded transition. The windows are constants so the
 * in-flight argument rests on no tunable (#479). Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
 */
@Service
class PaymentReconciliationService implements PaymentReconciliation {

	/** A younger row may simply have its callback in flight. */
	private static final Duration IN_FLIGHT_GRACE = Duration.ofMinutes(30);

	/** Far wider than the daily cadence, so a missed run loses nothing and a repeat reports the same. */
	private static final Duration LOOKBACK = Duration.ofDays(30);

	/** Creating a payment is tens of seconds of retries; a day leaves orders of magnitude of margin (#479 Q2). */
	private static final Duration ORPHAN_AGE = Duration.ofHours(24);

	private static final int PAGE_SIZE = 200;

	private static final int REFERENCE_BATCH = 500;

	private static final String NO_PAYEE = "no_payee";

	private final PaymentGateway gateway;
	private final ReconcilablePayments payments;
	private final VerifiedPaymentOutcomes outcomes;
	private final Clock clock;

	PaymentReconciliationService(PaymentGateway gateway, ReconcilablePayments payments,
			VerifiedPaymentOutcomes outcomes, Clock clock) {
		this.gateway = gateway;
		this.payments = payments;
		this.outcomes = outcomes;
		this.clock = clock;
	}

	@Override
	public ReconciliationReport report() {
		Instant now = clock.instant();
		Instant from = now.minus(LOOKBACK);
		List<Divergence> divergences = new ArrayList<>();
		List<Unchecked> unchecked = new ArrayList<>();
		long after = 0L;
		List<ReconcilablePayment> page;
		do {
			page = payments.findOpenCreatedBetween(from, now.minus(IN_FLIGHT_GRACE), after, PAGE_SIZE);
			for (ReconcilablePayment payment : page) {
				compare(payment, divergences, unchecked);
				after = payment.id();
			}
		}
		while (page.size() == PAGE_SIZE);
		return switch (gateway.unpaidCreatedBetween(from, now.minus(ORPHAN_AGE))) {
			case UnpaidTransactions.Listed listed -> new ReconciliationReport(divergences, withNoRow(listed.references()),
					unchecked, OrphanListing.LISTED);
			case UnpaidTransactions.NotOffered ignored ->
				new ReconciliationReport(divergences, List.of(), unchecked, OrphanListing.NOT_OFFERED);
			case UnpaidTransactions.Unavailable ignored ->
				new ReconciliationReport(divergences, List.of(), unchecked, OrphanListing.UNAVAILABLE);
		};
	}

	private void compare(ReconcilablePayment payment, List<Divergence> divergences, List<Unchecked> unchecked) {
		Optional<PayeeRef> payee = payment.payee();
		if (payee.isEmpty()) {
			unchecked.add(new Unchecked(payment.id(), payment.reference(), NO_PAYEE));
			return;
		}
		switch (gateway.lookup(payee.get(), payment.reference())) {
			case ProviderPaymentState.Paid ignored -> divergences.add(new Divergence(Kind.PAID_LOCALLY_WAITING,
					payment.id(), payment.reference(), payee.get(), payment.bookings()));
			case ProviderPaymentState.Canceled ignored -> divergences.add(new Divergence(Kind.CANCELED_LOCALLY_WAITING,
					payment.id(), payment.reference(), payee.get(), payment.bookings()));
			case ProviderPaymentState.Waiting ignored -> {
				// Both sides still wait for the guest, so there is nothing to report.
			}
			case ProviderPaymentState.Unavailable unavailable ->
				unchecked.add(new Unchecked(payment.id(), payment.reference(), unavailable.reason()));
		}
	}

	private List<String> withNoRow(List<String> references) {
		Set<String> known = new HashSet<>();
		for (int start = 0; start < references.size(); start += REFERENCE_BATCH) {
			known.addAll(payments.knownReferences(references.subList(start,
					Math.min(start + REFERENCE_BATCH, references.size()))));
		}
		return references.stream().filter(reference -> !known.contains(reference)).toList();
	}

	@Override
	public RepairOutcome repair(long paymentId) {
		Optional<ReconcilablePayment> found = payments.findById(paymentId);
		if (found.isEmpty()) {
			return RepairOutcome.UNKNOWN_PAYMENT;
		}
		ReconcilablePayment payment = found.get();
		if (!payment.status().isOpen()) {
			return RepairOutcome.ALREADY_SETTLED;
		}
		if (payment.payee().isEmpty()) {
			return RepairOutcome.NO_PAYEE;
		}
		return switch (gateway.lookup(payment.payee().get(), payment.reference())) {
			case ProviderPaymentState.Paid ignored ->
				outcomes.succeeded(payment.reference()) ? RepairOutcome.CONFIRMED : RepairOutcome.ALREADY_SETTLED;
			case ProviderPaymentState.Canceled ignored ->
				outcomes.canceled(payment.reference()) ? RepairOutcome.CANCELED : RepairOutcome.ALREADY_SETTLED;
			case ProviderPaymentState.Waiting ignored -> RepairOutcome.NO_DIVERGENCE;
			case ProviderPaymentState.Unavailable ignored -> RepairOutcome.PROVIDER_UNAVAILABLE;
		};
	}
}
