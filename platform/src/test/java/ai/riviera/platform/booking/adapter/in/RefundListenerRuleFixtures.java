package ai.riviera.platform.booking.adapter.in;

import org.springframework.context.event.EventListener;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingCancelled;

/**
 * Deliberately mis-shaped listeners for {@link RefundListenerExecutorArchitectureTest}'s negative
 * cases, so the rule is proven to reject what it claims to reject <em>without</em> anyone temporarily
 * breaking production code and remembering to put it back.
 *
 * <p>They are safe to leave on the test classpath: they carry no {@code @Component}, so Spring never
 * instantiates them, and the rule discovers production listeners through
 * {@code ArchitectureTestSupport.productionClasses()}, which excludes the test source set. That
 * exclusion is not incidental — the mail rule's first cut once scanned {@code classpath*:},
 * which under Gradle spans {@code build/classes/java/main} <em>and</em> {@code .../test}, so a fixture
 * like this one would have read as a production violation.
 */
final class RefundListenerRuleFixtures {

	private RefundListenerRuleFixtures() {
	}

	/** What {@link BookingRefundListener} would revert to — the composite that hides the shared pool. */
	static final class CompositeListener {

		@ApplicationModuleListener
		void on(BookingCancelled event) {
		}
	}

	/** The prescribed shape: a rule that rejects everything teaches nothing. */
	static final class CompliantListener {

		@Async(RefundExecutorConfig.REFUND_EXECUTOR)
		@TransactionalEventListener
		void on(BookingCancelled event) {
		}
	}

	/** Spring resolves {@code @Async} method-first then type, so a class-level one is compliant too. */
	@Async(RefundExecutorConfig.REFUND_EXECUTOR)
	static final class ClassLevelAsyncListener {

		@TransactionalEventListener
		void on(BookingCancelled event) {
		}
	}

	/** No {@code @Async} at all — the refund would run inline on the committing thread. */
	static final class InlineListener {

		@TransactionalEventListener
		void on(BookingCancelled event) {
		}
	}

	/**
	 * A plain {@code @EventListener}: it runs <em>inside</em> the publishing transaction, so it would
	 * refund against a commit that may never happen, and it leaves no {@code event_publication} row for
	 * the restart republish — which is the entire retry story for money owed under invariant #10.
	 */
	static final class PlainAsyncListener {

		@Async(RefundExecutorConfig.REFUND_EXECUTOR)
		@EventListener
		void on(BookingCancelled event) {
		}
	}
}
