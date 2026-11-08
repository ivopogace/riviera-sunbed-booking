package ai.riviera.platform.payment.adapter.in;

import java.util.concurrent.atomic.AtomicLong;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;
import ai.riviera.platform.payment.application.PaymentReconciliation;
import ai.riviera.platform.payment.application.ReconciliationReport;
import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.Kind;
import ai.riviera.platform.payment.application.ReconciliationReport.OrphanListing;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * Runs the reconciliation daily under a gateway that really collects. It only reports: a line of ids per finding
 * (invariant #7) and {@link ObservabilityMetrics#PAYMENT_RECONCILIATION_FINDINGS}; a clean run says nothing. Lockless
 * like the sweeps, a second runner only reports twice. Runbook: {@code docs/runbooks/payment-reconciliation.md}.
 */
@Component
@Profile("collecting-gateway")
class PaymentReconciliationScheduler {

	private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationScheduler.class);

	private static final String KIND_TAG = "kind";

	private final PaymentReconciliation reconciliation;
	private final AtomicLong paidWaiting = new AtomicLong();
	private final AtomicLong canceledWaiting = new AtomicLong();
	private final AtomicLong orphans = new AtomicLong();
	private final AtomicLong unchecked = new AtomicLong();

	PaymentReconciliationScheduler(PaymentReconciliation reconciliation, MeterRegistry meters) {
		this.reconciliation = reconciliation;
		register(meters, "paid_waiting", paidWaiting);
		register(meters, "canceled_waiting", canceledWaiting);
		register(meters, "orphan", orphans);
		register(meters, "unchecked", unchecked);
	}

	private static void register(MeterRegistry meters, String kind, AtomicLong value) {
		meters.gauge(ObservabilityMetrics.PAYMENT_RECONCILIATION_FINDINGS, Tags.of(KIND_TAG, kind), value);
	}

	@Scheduled(fixedDelayString = "${riviera.payment.reconciliation.interval:P1D}",
			initialDelayString = "${riviera.payment.reconciliation.initial-delay:PT30M}")
	void sweep() {
		ReconciliationReport report = reconciliation.report();
		report.divergences().forEach(PaymentReconciliationScheduler::logDivergence);
		report.orphans().forEach(reference -> log.warn("payment reconciliation: ORPHAN reference={}", reference));
		report.unchecked().forEach(PaymentReconciliationScheduler::logUnchecked);
		boolean listingUnavailable = report.orphanListing() == OrphanListing.UNAVAILABLE;
		if (listingUnavailable) {
			log.warn("payment reconciliation: the provider's unpaid transactions could not be listed");
		}
		paidWaiting.set(countOf(report, Kind.PAID_LOCALLY_WAITING));
		canceledWaiting.set(countOf(report, Kind.CANCELED_LOCALLY_WAITING));
		orphans.set(report.orphans().size());
		unchecked.set(report.unchecked().size() + (listingUnavailable ? 1L : 0L));
	}

	private static void logDivergence(Divergence divergence) {
		log.warn("payment reconciliation: {} payment={} reference={} payee={} bookings={}", divergence.kind(),
				divergence.paymentId(), divergence.reference(), divergence.payee().value(),
				divergence.bookings().stream().map(BookingRef::value).toList());
	}

	private static void logUnchecked(Unchecked row) {
		log.warn("payment reconciliation: UNCHECKED payment={} reference={} reason={}", row.paymentId(),
				row.reference(), row.reason());
	}

	private static long countOf(ReconciliationReport report, Kind kind) {
		return report.divergences().stream().filter(divergence -> divergence.kind() == kind).count();
	}
}
