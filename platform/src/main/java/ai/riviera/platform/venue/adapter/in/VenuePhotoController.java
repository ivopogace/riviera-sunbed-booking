package ai.riviera.platform.venue.adapter.in;

import java.io.IOException;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import ai.riviera.platform.ApiProblem;
import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;
import ai.riviera.platform.venue.application.PhotoUploadResult;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.VenuePhotos;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Venue photo endpoints (#142) — a separate driving adapter from {@code VenueAdminController} so the
 * <strong>public</strong> serving GET sits apart from the authenticated writes. The writes are
 * <strong>venue-scoped</strong>: the controller resolves the principal to an {@link OperatorId} and
 * hands it to {@link VenuePhotos}, which asserts ownership before acting (invariant #13); a mismatch
 * is {@code 403} via {@code ApiErrorHandler}. Errors are RFC-7807 {@link ProblemDetail} (issue #97).
 *
 * <p>Upload is <strong>POST</strong> (not PUT): multipart parsing is reliable on POST across servlet
 * containers, and a slot upload is an idempotent replace regardless. The serving GET is
 * content-addressed by the variant hash and returned with a long-lived immutable cache + {@code ETag}
 * (ADR-0008), so the browser/CDN caches it and the DB is read ≈once per image; a matching
 * {@code If-None-Match} short-circuits to {@code 304}.
 */
@RestController
@RequestMapping("/api/venues")
class VenuePhotoController {

	/** One year, public, immutable — a replaced photo gets a new hash → a new URL (ADR-0008). */
	private static final CacheControl IMMUTABLE = CacheControl.maxAge(Duration.ofDays(365))
			.cachePublic().immutable();

	private final VenuePhotos photos;
	private final CurrentOperator currentOperator;

	VenuePhotoController(VenuePhotos photos, CurrentOperator currentOperator) {
		this.photos = photos;
		this.currentOperator = currentOperator;
	}

	@PostMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> upload(Authentication authentication, @PathVariable long venueId,
			@PathVariable String slot, @RequestPart("file") MultipartFile file) throws IOException {
		OperatorId operator = currentOperator.require(authentication);
		return switch (photos.upload(operator, new VenueId(venueId), parseSlot(slot), file.getBytes())) {
			case PhotoUploadResult.Stored(var metadata) ->
					ResponseEntity.ok(PhotoUploadResponse.from(venueId, metadata));
			case PhotoUploadResult.Rejected(var reason) -> reject(reason);
		};
	}

	@DeleteMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> delete(Authentication authentication, @PathVariable long venueId,
			@PathVariable String slot) {
		OperatorId operator = currentOperator.require(authentication);
		return photos.delete(operator, new VenueId(venueId), parseSlot(slot))
				? ResponseEntity.noContent().build()
				: ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_PHOTO", "No photo in this slot.");
	}

	@GetMapping("/{venueId}/photos/{hash}")
	ResponseEntity<?> serve(@PathVariable long venueId, @PathVariable String hash,
			@RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
		ContentHash contentHash;
		try {
			contentHash = new ContentHash(hash); // the hex-only guard: a non-hex path can't name a variant
		} catch (IllegalArgumentException e) {
			return ResponseEntity.notFound().build(); // → 404, and no lookup (path-traversal / SSRF safe)
		}
		String etag = "\"" + hash + "\"";
		if (etag.equals(ifNoneMatch)) {
			return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
					.cacheControl(IMMUTABLE)
					.header(HttpHeaders.ETAG, etag)
					.build();
		}
		Optional<StoredBytes> found = photos.serve(new VenueId(venueId), contentHash);
		if (found.isEmpty()) {
			return ResponseEntity.notFound().build();
		}
		StoredBytes bytes = found.get();
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(bytes.contentType()))
				.cacheControl(IMMUTABLE)
				.header(HttpHeaders.ETAG, etag)
				.body(bytes.bytes());
	}

	/** Map the lower-case REST slot to the {@link PhotoSlot} enum; an unknown value → 400 via the advice. */
	private static PhotoSlot parseSlot(String slot) {
		return PhotoSlot.valueOf(slot.toUpperCase(Locale.ROOT));
	}

	private static ResponseEntity<ProblemDetail> reject(Reason reason) {
		String detail = switch (reason) {
			case TOO_LARGE -> "The image is too large.";
			case UNSUPPORTED_FORMAT -> "Only JPEG, PNG, or WebP images are accepted.";
			case DIMENSIONS_EXCEEDED -> "The image dimensions are too large.";
			case UNREADABLE -> "The image could not be read.";
		};
		return ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(), detail);
	}
}
