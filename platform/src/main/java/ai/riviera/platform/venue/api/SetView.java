package ai.riviera.platform.venue.api;

/**
 * One set position on the read-only beach map. {@code tier} (PREMIUM/STANDARD),
 * {@code pool} (ONLINE/WALK_IN) and {@code availability} (FREE/TAKEN) are carried as their
 * string tokens — the same values the database CHECK constraints allow and the frontend
 * renders. {@code availability} is the U1 seed-only placeholder; U2 sources it from the
 * authoritative availability table without changing this shape.
 */
public record SetView(long id, String rowLabel, int positionNo, String tier, String pool,
		MoneyView price, int gridX, int gridY, String availability) {
}
