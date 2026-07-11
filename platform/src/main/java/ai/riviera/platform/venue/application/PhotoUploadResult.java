package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;

/**
 * The outcome of {@link VenuePhotos#upload} — a typed value the controller maps to HTTP: a
 * {@link Stored} carrying the new variant metadata (→ {@code 200} with per-surface URLs) or a
 * {@link Rejected} carrying the processor's {@link Reason} (→ {@code 400} with that reason as the
 * stable {@code code}). Ownership failures are not modelled here — they throw before processing.
 */
public sealed interface PhotoUploadResult {

	record Stored(PhotoMetadata metadata) implements PhotoUploadResult {
	}

	record Rejected(Reason reason) implements PhotoUploadResult {
	}
}
