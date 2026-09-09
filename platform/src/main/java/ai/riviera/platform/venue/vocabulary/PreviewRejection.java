package ai.riviera.platform.venue.vocabulary;

/**
 * Why a remodel preview could not be computed. The layout-shape rejections (an empty layout, two
 * sets in one cell, a split row) are the save's to state; a preview only needs the venue and the
 * token the tab loaded.
 */
public enum PreviewRejection {
	NO_SUCH_VENUE,
	/** The submitted {@code expectedVersion} is not the venue's current {@code set_version}. */
	STALE_WRITE
}
