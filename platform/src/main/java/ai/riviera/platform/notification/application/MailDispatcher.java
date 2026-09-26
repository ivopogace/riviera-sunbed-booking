package ai.riviera.platform.notification.application;

/**
 * Runs a transactional send off the caller's thread, in memory (ADR-0011 decision 5): the vehicle
 * for bearer-credential payloads (invariant #7), which must never ride the Event Publication
 * Registry — it persists payloads to {@code event_publication} in cleartext. Ids-only payloads go
 * there. Best-effort: a lost send is dropped, logged and counted by {@code kind}; the recovery kinds
 * self-heal, the operator-approval notice does not. <strong>Never throws</strong>: a send may affect
 * neither the response's status (D-8 non-enumeration) nor its latency (the timing oracle).
 */
@FunctionalInterface
interface MailDispatcher {

	/** Run the send away from the caller's thread, attributed to {@code kind} if it is lost. Never throws. */
	void dispatch(MailKind kind, Runnable send);
}
