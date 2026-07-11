package ai.riviera.platform.venue.vocabulary;

/**
 * A per-surface rendered variant of a venue photo (#142). Each photo is resized at upload into a
 * fixed set of capped variants — never the full-res original (ADR-0008): {@code CARD} for the
 * Discover card thumbnail, {@code BANNER} for the beach-map banner band, {@code PREVIEW} for the
 * operator slot. The enum name is the DB token ({@code CHECK (surface IN ('CARD','BANNER','PREVIEW'))}).
 */
public enum PhotoSurface {
	CARD,
	BANNER,
	PREVIEW
}
