package ai.riviera.placementfixture.consumer.adapter.in;

import org.springframework.modulith.events.ApplicationModuleListener;

import ai.riviera.placementfixture.provider.vocabulary.MisplacedEvent;

/** Listens to a foreign type that does not live in the owner's {@code events} surface. */
public class BadListener {

	@ApplicationModuleListener
	void on(MisplacedEvent event) {
	}
}
