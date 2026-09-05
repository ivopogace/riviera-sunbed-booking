package ai.riviera.platform.venue.vocabulary;

/**
 * One set position on the read-only beach map. {@code tier} (PREMIUM/STANDARD) and
 * {@code availability} (FREE/TAKEN) are carried as their string tokens — the same values the
 * database CHECK constraints allow and the frontend renders; {@code pool} is the typed
 * {@link Pool}, serialised by name so the wire carries the same tokens. {@code availability}
 * is sourced from the authoritative availability table (invariant #2), never from venue's own rows.
 */
public record SetView(long id, String rowLabel, int positionNo, String tier, Pool pool,
		MoneyView price, int gridX, int gridY, String availability) {
}
