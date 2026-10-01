package ai.riviera.platform;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.MergedAnnotation;
import org.springframework.core.annotation.MergedAnnotations;
import org.springframework.transaction.event.TransactionalEventListener;

import com.tngtech.archunit.core.domain.JavaClass;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins what the Event Publication Registry persists: every registry-tracked listener's explicit
 * {@code id} (its {@code listener_id}) and its event FQCN ({@code event_type}) against
 * {@code event-registry/listener-ids.txt}. A change here strands outstanding rows unless a forward
 * Flyway rewrite ships with it (invariant #12); rationale: {@code riviera-modulith} events reference.
 */
class ListenerIdSnapshotTest {

	private static final String SNAPSHOT = "/event-registry/listener-ids.txt";

	private static final List<String> SPINE_RETRIES = List.of(
			"ai.riviera.platform.booking.adapter.in.BookingSpineRetry",
			"ai.riviera.platform.payout.adapter.in.PayoutSpineRetry",
			"ai.riviera.platform.venue.adapter.in.VenueSpineRetry");

	@Test
	void everyRegistryListenerHasAPinnedExplicitId() throws IOException {
		List<String> violations = new ArrayList<>();
		Set<String> live = new TreeSet<>();
		Set<String> ids = new TreeSet<>();
		for (Method listener : registryListeners()) {
			String id = explicitId(listener);
			if (id.isBlank()) {
				violations.add(describe(listener) + " has no explicit id, so the registry keys it on the method "
						+ "signature and a rename orphans its rows");
				continue;
			}
			if (!ids.add(id)) {
				violations.add(describe(listener) + " reuses the id " + id);
			}
			live.add(id + " " + listener.getParameterTypes()[0].getName());
		}
		ArchitectureTestSupport.assertNoViolations("Registry listener ids", violations);

		assertEquals(snapshot(), live, "Registry listener ids or event types changed. Ship a forward Flyway "
				+ "rewrite of event_publication(_archive) for every changed pair, then update " + SNAPSHOT);
	}

	/**
	 * Each module's automatic spine retry names only pinned ids, and never a refund or mail listener: those
	 * re-ask the gateway or re-send a mail, so they stay on their admin levers (#1340).
	 */
	@Test
	void spineRetriesNameOnlyPinnedIdempotentListeners() throws Exception {
		Set<String> pinned = snapshot().stream().map(line -> line.split(" ")[0]).collect(Collectors.toSet());
		Set<String> neverAutomatic = Set.of("booking.refund-on-booking-cancelled",
				"booking.day-refund-on-booking-day-refunded", "booking.release-void-on-booking-cancelled");
		for (String retry : SPINE_RETRIES) {
			Field field = Class.forName(retry).getDeclaredField("LISTENER_IDS");
			field.setAccessible(true);
			@SuppressWarnings("unchecked")
			Set<String> ids = (Set<String>) field.get(null);

			assertTrue(pinned.containsAll(ids), retry + " names an unpinned listener id: " + ids);
			assertTrue(ids.stream().noneMatch(id -> id.startsWith("notification.") || neverAutomatic.contains(id)),
					retry + " auto-retries a mail or refund listener: " + ids);
		}
	}

	@Test
	void theScanFindsTheListeners() {
		assertTrue(registryListeners().size() >= 20,
				"non-vacuity: a scan finding no listeners would satisfy the snapshot rule trivially");
	}

	static List<Method> registryListeners() {
		List<Method> listeners = new ArrayList<>();
		for (JavaClass type : ArchitectureTestSupport.productionClasses()) {
			Arrays.stream(type.reflect().getDeclaredMethods())
					.filter(method -> MergedAnnotations.from(method).isPresent(TransactionalEventListener.class))
					.forEach(listeners::add);
		}
		return listeners;
	}

	static String explicitId(Method listener) {
		MergedAnnotation<TransactionalEventListener> annotation =
				MergedAnnotations.from(listener).get(TransactionalEventListener.class);
		return annotation.getString("id");
	}

	private static Set<String> snapshot() throws IOException {
		try (InputStream in = ListenerIdSnapshotTest.class.getResourceAsStream(SNAPSHOT)) {
			String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
			return text.lines()
					.map(String::strip)
					.filter(line -> !line.isEmpty() && !line.startsWith("#"))
					.collect(Collectors.toCollection(TreeSet::new));
		}
	}

	private static String describe(Method listener) {
		return listener.getDeclaringClass().getName() + "#" + listener.getName();
	}
}
