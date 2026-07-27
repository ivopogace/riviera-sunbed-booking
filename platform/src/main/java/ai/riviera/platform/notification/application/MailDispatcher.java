package ai.riviera.platform.notification.application;

/**
 * Internal seam deciding <em>where</em> a transactional-email send runs (#369, ADR-0011 decision 5;
 * moved into the {@code notification} module in #382).
 *
 * <p>Recovery mail carries a raw single-use token inside the emailed link — a bearer credential
 * (invariant #7) — so it deliberately does <strong>not</strong> ride the Spring Modulith Event
 * Publication Registry: the registry serializes event payloads into {@code event_publication}, which would
 * persist that credential in cleartext and, under this application's {@code archive} completion mode, keep
 * it after the send — defeating the S8 design where only the digest is ever stored. The rule epic #367
 * settled: <em>ids-only payload → registry; bearer-credential payload → this in-memory dispatcher</em>.
 * Losing a send to a crash is acceptable precisely because the flow is user-retryable.
 *
 * <p><strong>Contract: an implementation never throws.</strong> The send is a best-effort side channel
 * whose outcome may influence neither the response's status code (the D-8 non-enumeration contract) nor
 * its latency (the timing oracle this seam exists to close). A dispatch that cannot be accepted is dropped
 * and logged. Package-private application-internal machinery (RV-BE-11).
 */
@FunctionalInterface
interface MailDispatcher {

	/** Run the send away from the caller's thread. Never throws. */
	void dispatch(Runnable send);
}
