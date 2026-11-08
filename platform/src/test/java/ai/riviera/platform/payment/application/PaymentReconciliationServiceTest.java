package ai.riviera.platform.payment.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.OrphanListing;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.domain.RefundScope;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The comparison and the repair over in-memory doubles: what is reported, what is left alone, that detection writes
 * nothing, and that a repair applies only the provider's fresh answer. The real SQL, the guarded transition and the
 * booking effect are {@code PaymentReconciliationIT}'s.
 */
class PaymentReconciliationServiceTest {

	private static final Instant NOW = Instant.parse("2026-11-01T09:00:00Z");

	private static final Duration ORPHAN_AGE = Duration.ofHours(24);

	private static final PayeeRef PAYEE = new PayeeRef(11L);

	private static final BookingRef BOOKING = new BookingRef(4242L);

	private final FakeRows rows = new FakeRows();

	private final FakeGateway gateway = new FakeGateway();

	private final RecordingOutcomes outcomes = new RecordingOutcomes();

	private final PaymentReconciliationService service = new PaymentReconciliationService(gateway, rows, outcomes,
			Clock.fixed(NOW, ZoneOffset.UTC));

	private ReconcilablePayment open(long id, String reference) {
		ReconcilablePayment row = new ReconcilablePayment(id, reference, PaymentStatus.REQUIRES_PAYMENT,
				Optional.of(PAYEE), List.of(BOOKING));
		rows.add(row);
		return row;
	}

	@Test
	void aProviderPaidWaitingPaymentIsReportedAndNothingChanges() {
		open(1L, "pi_paid");
		gateway.answers.put("pi_paid", new ProviderPaymentState.Paid());

		ReconciliationReport report = service.report();

		assertEquals(List.of(new Divergence(ReconciliationReport.Kind.PAID_LOCALLY_WAITING, 1L, "pi_paid", PAYEE,
				List.of(BOOKING))), report.divergences());
		assertTrue(outcomes.applied.isEmpty(), "detection never repairs");
	}

	@Test
	void aProviderCanceledWaitingPaymentIsReportedAndNothingChanges() {
		open(2L, "pi_gone");
		gateway.answers.put("pi_gone", new ProviderPaymentState.Canceled());

		ReconciliationReport report = service.report();

		assertEquals(List.of(new Divergence(ReconciliationReport.Kind.CANCELED_LOCALLY_WAITING, 2L, "pi_gone", PAYEE,
				List.of(BOOKING))), report.divergences());
		assertTrue(outcomes.applied.isEmpty(), "detection never repairs");
	}

	@Test
	void anAgreeingPaymentIsNotReported() {
		open(3L, "pi_open");
		gateway.answers.put("pi_open", new ProviderPaymentState.Waiting());

		ReconciliationReport report = service.report();

		assertTrue(report.isClean(), "agreement is silence");
	}

	@Test
	void anUnreadablePaymentIsUncheckedNotClean() {
		open(4L, "pi_dark");
		gateway.answers.put("pi_dark", new ProviderPaymentState.Unavailable("rate_limit"));

		ReconciliationReport report = service.report();

		assertEquals(List.of(new Unchecked(4L, "pi_dark", "rate_limit")), report.unchecked());
		assertTrue(report.divergences().isEmpty());
	}

	@Test
	void aRowWithNoPayeeIsNeverLookedUp() {
		rows.add(new ReconcilablePayment(5L, "pi_old", PaymentStatus.REQUIRES_PAYMENT, Optional.empty(), List.of(BOOKING)));

		ReconciliationReport report = service.report();

		assertEquals(List.of(new Unchecked(5L, "pi_old", "no_payee")), report.unchecked());
		assertTrue(gateway.lookedUp.isEmpty(), "a venue is never assumed");
		assertEquals(RepairOutcome.NO_PAYEE, service.repair(5L));
		assertTrue(gateway.lookedUp.isEmpty(), "nor by the repair");
	}

	@Test
	void readsEveryPageAndARepeatRunReportsTheSame() {
		LongStream.rangeClosed(1L, 450L).forEach(id -> {
			open(id, "pi_" + id);
			gateway.answers.put("pi_" + id, new ProviderPaymentState.Paid());
		});

		ReconciliationReport first = service.report();

		assertEquals(450, first.divergences().size(), "more rows than one page");
		assertEquals(first, service.report(), "a repeat run reports the same");
	}

	@Test
	void anUnpaidTransactionWithNoRowIsAnOrphanAndNeverCanceled() {
		open(6L, "pi_known");
		gateway.answers.put("pi_known", new ProviderPaymentState.Waiting());
		gateway.listing = new UnpaidTransactions.Listed(List.of("pi_known", "pi_orphan"));

		ReconciliationReport report = service.report();

		assertEquals(List.of("pi_orphan"), report.orphans());
		assertEquals(OrphanListing.LISTED, report.orphanListing());
		assertEquals(0, gateway.cancels, "an orphan is reported, never voided");
	}

	@Test
	void onlyTransactionsOlderThanTheOrphanAgeAreAskedFor() {
		service.report();

		assertEquals(NOW.minus(ORPHAN_AGE), gateway.listedBefore, "younger may still be in flight");
	}

	@Test
	void aProviderWithNoListingReportsNoOrphansAndSaysSo() {
		gateway.listing = new UnpaidTransactions.NotOffered();

		ReconciliationReport report = service.report();

		assertTrue(report.isClean());
		assertEquals(OrphanListing.NOT_OFFERED, report.orphanListing());
	}

	@Test
	void anUnavailableListingIsNotClean() {
		gateway.listing = new UnpaidTransactions.Unavailable("rate_limit");

		ReconciliationReport report = service.report();

		assertEquals(OrphanListing.UNAVAILABLE, report.orphanListing());
		assertTrue(!report.isClean(), "not knowing is not the same as nothing found");
	}

	@Test
	void aRepairAppliesTheProviderPaidAnswerOnce() {
		open(7L, "pi_paid");
		gateway.answers.put("pi_paid", new ProviderPaymentState.Paid());

		assertEquals(RepairOutcome.CONFIRMED, service.repair(7L));
		assertEquals(List.of("succeeded:pi_paid"), outcomes.applied);
	}

	@Test
	void aRepairAppliesTheProviderCanceledAnswer() {
		open(8L, "pi_gone");
		gateway.answers.put("pi_gone", new ProviderPaymentState.Canceled());

		assertEquals(RepairOutcome.CANCELED, service.repair(8L));
		assertEquals(List.of("canceled:pi_gone"), outcomes.applied);
	}

	@Test
	void aRepairOfAnAgreeingPaymentChangesNothing() {
		open(9L, "pi_open");
		gateway.answers.put("pi_open", new ProviderPaymentState.Waiting());

		assertEquals(RepairOutcome.NO_DIVERGENCE, service.repair(9L));
		assertTrue(outcomes.applied.isEmpty());
	}

	@Test
	void aRepairOfAnUnreadablePaymentChangesNothing() {
		open(10L, "pi_dark");
		gateway.answers.put("pi_dark", new ProviderPaymentState.Unavailable("rate_limit"));

		assertEquals(RepairOutcome.PROVIDER_UNAVAILABLE, service.repair(10L));
		assertTrue(outcomes.applied.isEmpty());
	}

	@Test
	void aRepairThatLosesTheRaceReportsItSettled() {
		open(11L, "pi_paid");
		gateway.answers.put("pi_paid", new ProviderPaymentState.Paid());
		outcomes.moves = false;

		assertEquals(RepairOutcome.ALREADY_SETTLED, service.repair(11L));
	}

	@Test
	void aSettledPaymentIsNotAskedAboutAgain() {
		rows.add(new ReconcilablePayment(12L, "pi_done", PaymentStatus.SUCCEEDED, Optional.of(PAYEE), List.of(BOOKING)));

		assertEquals(RepairOutcome.ALREADY_SETTLED, service.repair(12L));
		assertTrue(gateway.lookedUp.isEmpty(), "converged: a second press does not reach the provider");
	}

	@Test
	void anUnknownPaymentIsSaidToBe() {
		assertEquals(RepairOutcome.UNKNOWN_PAYMENT, service.repair(404L));
	}

	private static final class FakeRows implements ReconcilablePayments {

		private final Map<Long, ReconcilablePayment> byId = new HashMap<>();

		void add(ReconcilablePayment row) {
			byId.put(row.id(), row);
		}

		@Override
		public List<ReconcilablePayment> findOpenCreatedBetween(Instant from, Instant before, long afterId, int limit) {
			return byId.values().stream()
					.filter(row -> row.status() == PaymentStatus.REQUIRES_PAYMENT && row.id() > afterId)
					.sorted(java.util.Comparator.comparingLong(ReconcilablePayment::id))
					.limit(limit)
					.toList();
		}

		@Override
		public Optional<ReconcilablePayment> findById(long paymentId) {
			return Optional.ofNullable(byId.get(paymentId));
		}

		@Override
		public Set<String> knownReferences(Collection<String> references) {
			Set<String> known = new HashSet<>();
			byId.values().forEach(row -> known.add(row.reference()));
			known.retainAll(references);
			return known;
		}
	}

	private static final class FakeGateway implements PaymentGateway {

		final Map<String, ProviderPaymentState> answers = new HashMap<>();

		final List<String> lookedUp = new ArrayList<>();

		UnpaidTransactions listing = new UnpaidTransactions.Listed(List.of());

		Instant listedBefore;

		int cancels;

		@Override
		public ProviderPaymentState lookup(PayeeRef payee, String reference) {
			lookedUp.add(reference);
			return answers.get(reference);
		}

		@Override
		public UnpaidTransactions unpaidCreatedBetween(Instant from, Instant before) {
			listedBefore = before;
			return listing;
		}

		@Override
		public PaymentCancellation cancel(BookingRef booking) {
			cancels++;
			return new PaymentCancellation.Canceled();
		}

		@Override
		public PaymentOutcome initiate(PayeeRef payee, List<CollectionShare> shares) {
			throw new UnsupportedOperationException();
		}

		@Override
		public RefundResult refund(BookingRef booking, RefundScope scope, Money amount) {
			throw new UnsupportedOperationException();
		}
	}

	private static final class RecordingOutcomes implements VerifiedPaymentOutcomes {

		final List<String> applied = new ArrayList<>();

		boolean moves = true;

		@Override
		public boolean succeeded(String reference) {
			applied.add("succeeded:" + reference);
			return moves;
		}

		@Override
		public boolean canceled(String reference) {
			applied.add("canceled:" + reference);
			return moves;
		}

		@Override
		public boolean failed(String reference) {
			applied.add("failed:" + reference);
			return moves;
		}
	}
}
