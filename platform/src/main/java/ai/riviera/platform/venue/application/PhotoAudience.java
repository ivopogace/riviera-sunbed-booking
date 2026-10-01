package ai.riviera.platform.venue.application;

/**
 * Who a served photo may be cached for: {@link #PUBLIC} for a tourist-visible venue, {@link #PRIVATE}
 * for a hidden venue's photo read through the owner/admin bypass, so no shared cache stores it.
 */
public enum PhotoAudience {
	PUBLIC,
	PRIVATE
}
