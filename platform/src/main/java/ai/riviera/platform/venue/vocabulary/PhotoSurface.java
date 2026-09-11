package ai.riviera.platform.venue.vocabulary;

/**
 * The target box a venue photo is rendered into at upload — never the full-res original (ADR-0008):
 * {@code CARD} for the Discover card thumbnail, {@code BANNER} for the venue page's photo bands,
 * {@code LIGHTBOX} for the near-square modal viewer, {@code PREVIEW} for the operator slot. The
 * enum name is the DB token
 * ({@code CHECK (surface IN ('CARD','BANNER','LIGHTBOX','PREVIEW'))}).
 *
 * <p>A surface is not one stored row: it is keyed with a density {@code scale}. {@code CARD} and
 * {@code BANNER} carry a scale-2 rendition alongside their baseline so the browser can pick from a
 * {@code srcset}; {@code PREVIEW} stays single because the operator slot is small and
 * authenticated, and {@code LIGHTBOX} because its box already is a DPR-2 size.
 */
public enum PhotoSurface {
	CARD,
	BANNER,
	LIGHTBOX,
	PREVIEW
}
