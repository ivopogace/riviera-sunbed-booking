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
 *
 * <p>Losing a send to a crash is acceptable for the recovery pair, whose flow is user-retryable: the
 * token is already stored, so the person asks again. Since #375 this dispatcher also carries the
 * operator-approval notice, for which it is <em>not</em> — nothing re-sends that one, so the loss is
 * unrecoverable and mitigated only operationally (ADR-0011 decision 5, amended #439). The vehicle's
 * mechanics are one rule; what a loss costs is per-kind.
 *
 * <p><strong>Contract: an implementation never throws.</strong> The send is a best-effort side channel
 * whose outcome may influence neither the response's status code (the D-8 non-enumeration contract) nor
 * its latency (the timing oracle this seam exists to close). A dispatch that cannot be accepted is dropped
 * and logged. Package-private application-internal machinery (RV-BE-11).
 *
 * <p><strong>The kind rides along because the implementation accounts for what it loses</strong> (#442).
 * This seam was {@code dispatch(Runnable)} until then, which left {@code AsyncMailDispatcher} holding the
 * whole drop-accounting responsibility — three counters and a log line per loss — with no vocabulary to
 * account <em>with</em>: every dropped mail was an unattributed increment, and a lost approval notice was
 * indistinguishable from a lost password reset. The kind is already in the caller's hand at every call
 * site, so carrying it is not extra coupling; it is the parameter the accounting always needed.
 */
@FunctionalInterface
interface MailDispatcher {

	/** Run the send away from the caller's thread, attributed to {@code kind} if it is lost. Never throws. */
	void dispatch(MailKind kind, Runnable send);
}
