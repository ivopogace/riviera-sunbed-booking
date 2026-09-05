package ai.riviera.poolfixture;

/**
 * A deliberately mis-built consumer for {@code PoolTokenArchitectureTest}'s negative case: it
 * re-declares the online-pool token as a literal of its own instead of comparing against
 * {@code venue.vocabulary.Pool}. Test scope only; never wired into a context.
 */
public final class RoguePoolLiteral {

	private static final String ONLINE_POOL = "ONLINE";

	private RoguePoolLiteral() {
	}

	public static boolean isOnline(String pool) {
		return ONLINE_POOL.equals(pool);
	}
}
