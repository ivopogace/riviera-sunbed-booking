package ai.riviera.platform.venue.application;

/**
 * The typed outcome of {@link PhotoProcessor#process} — a value, not an exception, because an
 * operator uploading a bad file is <em>expected, caller-handled</em> flow (riviera-java-conventions
 * §6): the service maps a {@link Rejected} to a {@code 400} {@code ProblemDetail} with a stable
 * {@code code}, never a stack trace. Sealed so the service's {@code switch} is exhaustive.
 */
public sealed interface PhotoProcessingResult {

	/** The upload passed validation and produced its capped, EXIF-stripped variants. */
	record Processed(ProcessedPhoto photo) implements PhotoProcessingResult {
	}

	/** The upload was rejected; {@link #reason()} maps to the wire {@code code}. */
	record Rejected(Reason reason) implements PhotoProcessingResult {
	}

	/** Why an upload was rejected — each maps to a stable {@code ProblemDetail} code at the controller. */
	enum Reason {
		/** Larger than the configured max upload size. */
		TOO_LARGE,
		/** Not a JPEG / PNG / WebP by its actual bytes (magic sniff — the client Content-Type is ignored). */
		UNSUPPORTED_FORMAT,
		/** Decodes beyond the per-side / megapixel guard (decompression-bomb protection). */
		DIMENSIONS_EXCEEDED,
		/** Magic looked right but no reader could decode it (truncated / corrupt). */
		UNREADABLE
	}
}
