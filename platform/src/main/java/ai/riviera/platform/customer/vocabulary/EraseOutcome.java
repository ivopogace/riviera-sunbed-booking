package ai.riviera.platform.customer.vocabulary;

/**
 * Result of a right-to-erasure request (Slice 1 of #101). A dataless, caller-handled outcome — a plain
 * {@code enum} (like {@code availability}'s {@code ClaimOutcome}), not an exception: "nothing to erase" is
 * normal flow, not a stack trace.
 *
 * <ul>
 *   <li>{@link #ERASED} — at least one live row (account and/or guest contact) was tombstoned.</li>
 *   <li>{@link #ALREADY_ERASED} — the subject exists but was already tombstoned (self-service re-request).</li>
 *   <li>{@link #NOT_FOUND} — no matching live subject. The edge maps this to a no-op success (204), so an
 *       erasure request never reveals whether an email exists (non-enumeration, design D-8).</li>
 * </ul>
 */
public enum EraseOutcome {
	ERASED,
	ALREADY_ERASED,
	NOT_FOUND
}
