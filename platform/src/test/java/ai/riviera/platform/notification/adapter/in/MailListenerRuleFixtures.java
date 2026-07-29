package ai.riviera.platform.notification.adapter.in;

import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * The deliberately-shaped listeners {@link MailListenerExecutorArchitectureTest} proves itself
 * against (#409). They are <strong>load-bearing test scope</strong> — do not "tidy" them away —
 * and they earn their keep twice:
 *
 * <ol>
 *   <li><strong>By existing here.</strong> They sit inside the very package the rule scans, so
 *       they are the standing proof that a test fixture no longer reads as a production
 *       violation. The old scanner resolved {@code classpath*:}, which under Gradle spans
 *       {@code build/classes/java/main} <em>and</em> {@code .../test}; this file would have
 *       failed the build with six violations that named no production code. Deleting them
 *       would leave that hole untested, not merely untidy.</li>
 *   <li><strong>By being fed to the collector.</strong> The rule's violation logic is a pure
 *       function of {@code List<Method>}, so every negative case — including "reverting
 *       {@code BookingConfirmationMailListener} to {@code @ApplicationModuleListener} still
 *       fails" — is proven here rather than by breaking production code. Same instinct as
 *       {@code ai.riviera.placementfixture}, which has to live in its own root package
 *       precisely because its rule cannot exclude test scope the way this one now does.</li>
 * </ol>
 *
 * <p>None of these carries a stereotype annotation, so component scanning never instantiates
 * them and no listener is ever registered; {@link #never(Object)} makes that a runtime fact
 * rather than a claim.
 */
final class MailListenerRuleFixtures {

	private MailListenerRuleFixtures() {
	}

	/**
	 * Stands in for a published domain event such as {@code booking.events.BookingConfirmed}.
	 * Declared here rather than imported so the fixtures depend on nothing outside this package,
	 * while still living under {@code ai.riviera.platform} — which is what makes the rule treat a
	 * listener of it as in-scope.
	 */
	record FixtureEvent(long id) {
	}

	/** The shape production code must use: registry-backed, after-commit, on the mail bulkhead. */
	static class CompliantListener {

		@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
		@TransactionalEventListener
		void on(FixtureEvent event) {
			never(event);
		}
	}

	/** The same shape with {@code @Async} on the type — Spring resolves it, so the rule must too. */
	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	static class ClassLevelAsyncListener {

		@TransactionalEventListener
		void on(FixtureEvent event) {
			never(event);
		}
	}

	/** What {@code BookingConfirmationMailListener} would revert to: a bare {@code @Async}. */
	static class CompositeListener {

		@ApplicationModuleListener
		void on(FixtureEvent event) {
			never(event);
		}
	}

	/** #409 hole 2: right executor, no transactional binding — no publication, no commit barrier. */
	static class PlainAsyncListener {

		@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
		@EventListener
		void on(FixtureEvent event) {
			never(event);
		}
	}

	/** Transactional, but bound to the wrong phase — the send would precede the commit. */
	static class BeforeCommitListener {

		@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
		@TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
		void on(FixtureEvent event) {
			never(event);
		}
	}

	/** A container-lifecycle listener: no publishing transaction, so the rules do not apply. */
	static class ContainerLifecycleListener {

		@EventListener
		void on(ContextRefreshedEvent event) {
			never(event);
		}
	}

	/** These exist to be read, never dispatched; a call means something registered them as beans. */
	private static void never(Object event) {
		throw new UnsupportedOperationException("fixture listener dispatched for " + event);
	}
}
