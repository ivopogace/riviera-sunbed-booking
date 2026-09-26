package ai.riviera.platform.venue.vocabulary;

/**
 * The target box a venue photo is rendered into at upload — never the full-res original (ADR-0008):
 * {@code CARD} Discover card thumbnail, {@code BANNER} venue-page photos, {@code LIGHTBOX}
 * near-square modal viewer, {@code PREVIEW} operator slot. The name is the DB surface token.
 *
 * <p>Rows are keyed by surface plus density {@code scale}: {@code CARD} and {@code BANNER} add a
 * scale-2 {@code srcset} rendition; {@code PREVIEW} (small, authenticated) and {@code LIGHTBOX}
 * (already DPR-2) stay single; {@code LIGHTBOX} is absent when the upload is too small to fill it.
 */
public enum PhotoSurface {
	CARD,
	BANNER,
	LIGHTBOX,
	PREVIEW
}
