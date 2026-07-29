package ai.riviera.placementfixture.consumer.adapter.in;

import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.placementfixture.provider.vocabulary.MisplacedEvent;

/**
 * The same violation as {@link BadListener}, written in {@code @ApplicationModuleListener}'s
 * <em>expanded</em> form — the shape a listener takes when it needs to name its own executor
 * (#383 did exactly that to keep mail off the money-path pool).
 *
 * <p>Its own fixture because the placement rule used to key on the composite annotation alone, so
 * decomposing a listener quietly removed it from the rule's reach: the build stayed green while the
 * check stopped applying. A rule that only recognises one spelling of the same thing is a rule with
 * a hole in it.
 */
public class BadDecomposedListener {

	@Async("someExecutor")
	@TransactionalEventListener
	void on(MisplacedEvent event) {
	}
}
