package ai.riviera.platform.shared;

/**
 * The names of the money-path metrics (issue #100, D4) — the single source of truth shared by the
 * emitters and the alert self-check. A public {@code shared}-kernel vocabulary (like {@link ApiProblem}) so a
 * module emitter can reference a name without reaching into another module; the {@code String}
 * constants are inlined at compile time, so referencing one creates no runtime dependency on this
 * class (invariant #11).
 */
public final class ObservabilityMetrics {

	/** Gauge: incomplete Spring Modulith event publications (outbox backlog) — signal 1 of 3. */
	public static final String OUTBOX_PENDING = "riviera.outbox.pending";

	/** Counter: refunds the gateway failed to issue — signal 2 of 3. */
	public static final String REFUNDS_FAILED = "riviera.refunds.failed";

	/** Standard Boot Web timer; a webhook 5xx is a tag slice of it — signal 3 of 3. */
	public static final String HTTP_SERVER_REQUESTS = "http.server.requests";

	private ObservabilityMetrics() {
	}
}
