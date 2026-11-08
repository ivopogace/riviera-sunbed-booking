package ai.riviera.platform.payment.adapter.in;

import java.util.List;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;
import ai.riviera.platform.payment.application.PaymentReconciliation;
import ai.riviera.platform.payment.application.ReconciliationReport;
import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.Kind;
import ai.riviera.platform.payment.application.ReconciliationReport.OrphanListing;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** What a scheduled run says: one id-only line per finding and a gauge per kind, and nothing at all when clean. */
class PaymentReconciliationSchedulerTest {

	private static final ReconciliationReport CLEAN =
			new ReconciliationReport(List.of(), List.of(), List.of(), OrphanListing.LISTED);

	private final PaymentReconciliation reconciliation = mock(PaymentReconciliation.class);

	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final PaymentReconciliationScheduler scheduler = new PaymentReconciliationScheduler(reconciliation, meters);

	private final Logger logger = (Logger) LoggerFactory.getLogger(PaymentReconciliationScheduler.class);

	private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

	@BeforeEach
	void capture() {
		lines.start();
		logger.addAppender(lines);
	}

	@AfterEach
	void release() {
		logger.detachAppender(lines);
	}

	private double gauge(String kind) {
		return meters.get(ObservabilityMetrics.PAYMENT_RECONCILIATION_FINDINGS).tag("kind", kind).gauge().value();
	}

	@Test
	void aCleanRunLogsNothing() {
		when(reconciliation.report()).thenReturn(CLEAN);

		scheduler.sweep();

		assertThat(lines.list).isEmpty();
		assertEquals(0.0, gauge("paid_waiting"));
		assertEquals(0.0, gauge("canceled_waiting"));
		assertEquals(0.0, gauge("orphan"));
		assertEquals(0.0, gauge("unchecked"));
	}

	@Test
	void aDivergentRunReportsEachByIdAndSetsTheGauges() {
		when(reconciliation.report()).thenReturn(new ReconciliationReport(
				List.of(new Divergence(Kind.PAID_LOCALLY_WAITING, 7L, "pi_paid", new PayeeRef(11L), List.of(new BookingRef(42L))),
						new Divergence(Kind.CANCELED_LOCALLY_WAITING, 8L, "pi_gone", new PayeeRef(11L), List.of(new BookingRef(43L)))),
				List.of("pi_orphan"),
				List.of(new Unchecked(9L, "pi_dark", "no_payee")),
				OrphanListing.LISTED));

		scheduler.sweep();

		assertThat(lines.list).hasSize(4).allMatch(line -> line.getLevel() == Level.WARN);
		assertThat(lines.list.get(0).getFormattedMessage()).contains("PAID_LOCALLY_WAITING", "payment=7", "pi_paid", "42");
		assertEquals(1.0, gauge("paid_waiting"));
		assertEquals(1.0, gauge("canceled_waiting"));
		assertEquals(1.0, gauge("orphan"));
		assertEquals(1.0, gauge("unchecked"));
	}

	@Test
	void anUnavailableListingCountsAsUnchecked() {
		when(reconciliation.report()).thenReturn(
				new ReconciliationReport(List.of(), List.of(), List.of(), OrphanListing.UNAVAILABLE));

		scheduler.sweep();

		assertThat(lines.list).hasSize(1);
		assertEquals(1.0, gauge("unchecked"));
	}

	@Test
	void theGaugesFallBackWhenTheFindingsAreSettled() {
		when(reconciliation.report())
				.thenReturn(new ReconciliationReport(
						List.of(new Divergence(Kind.PAID_LOCALLY_WAITING, 7L, "pi_paid", new PayeeRef(11L), List.of())),
						List.of(), List.of(), OrphanListing.LISTED))
				.thenReturn(CLEAN);

		scheduler.sweep();
		scheduler.sweep();

		assertEquals(0.0, gauge("paid_waiting"));
	}
}
