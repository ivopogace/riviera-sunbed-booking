package ai.riviera.platform.venue.vocabulary;

/**
 * The target box a venue photo is rendered into at upload — never the full-res original (ADR-0008):
 * {@code CARD} for the Discover card thumbnail, {@code BANNER} for the beach-map banner band,
 * {@code PREVIEW} for the operator slot. The enum name is the DB token
 * ({@code CHECK (surface IN ('CARD','BANNER','PREVIEW'))}).
 *
 * <p>A surface is not one stored row: it is keyed with a density {@code scale}, and the two tourist
 * surfaces carry a scale-2 rendition alongside their baseline so the browser can pick from a
 * {@code srcset}. {@code PREVIEW} stays single.
 */
public enum PhotoSurface {
	CARD,
	BANNER,
	PREVIEW
}
