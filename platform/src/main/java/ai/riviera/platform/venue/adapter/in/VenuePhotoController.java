package ai.riviera.platform.venue.adapter.in;

import java.io.IOException;
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

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;
import ai.riviera.platform.venue.application.PhotoAudience;
import ai.riviera.platform.venue.application.PhotoUploadResult;
import ai.riviera.platform.venue.application.PhotoViewer;
import ai.riviera.platform.venue.application.ServedPhoto;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.VenuePhotos;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Venue photo endpoints: the content-hash serving GET, fenced on tourist visibility in
 * {@link VenuePhotos} (an owner/admin preview is served {@code private}), and the venue-scoped writes,
 * which assert ownership of the principal's {@link OperatorId} first (invariant #13, {@code 403}).
 * Serving sends a strong {@code ETag} under a revalidating directive, and a {@code 304} only while
 * the variant is still servable (a blob-free probe), so a takedown or a hidden venue reaches shared
 * caches. Errors are RFC-7807 {@link ProblemDetail}. Rationale: ADR-0008, ADR-0013.
 */
@RestController
@RequestMapping("/api/venues")
class VenuePhotoController {

	/** Public but always revalidated — a removal has to reach shared caches too (ADR-0008). */
	private static final CacheControl REVALIDATE = CacheControl.noCache().cachePublic();
	/** A hidden venue's photo previewed by its owner or an admin: never stored by a shared cache. */
	private static final CacheControl REVALIDATE_PRIVATE = CacheControl.noCache().cachePrivate();

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
		return switch (photos.upload(operator, new VenueId(venueId), PhotoSlots.parse(slot), file.getBytes())) {
			case PhotoUploadResult.Stored(var metadata) ->
					ResponseEntity.ok(PhotoUploadResponse.from(venueId, metadata));
			case PhotoUploadResult.Rejected(var reason) -> reject(reason);
		};
	}

	@DeleteMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> delete(Authentication authentication, @PathVariable long venueId,
			@PathVariable String slot) {
		OperatorId operator = currentOperator.require(authentication);
		return photos.delete(operator, new VenueId(venueId), PhotoSlots.parse(slot))
				? ResponseEntity.noContent().build()
				: ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_PHOTO", "No photo in this slot.");
	}

	@GetMapping("/{venueId}/photos/{hash}")
	ResponseEntity<?> serve(Authentication authentication, @PathVariable long venueId, @PathVariable String hash,
			@RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
		ContentHash contentHash;
		try {
			contentHash = new ContentHash(hash); // the hex-only guard: a non-hex path can't name a variant
		} catch (IllegalArgumentException e) {
			return ResponseEntity.notFound().build(); // → 404, and no lookup (path-traversal / SSRF safe)
		}
		PhotoViewer viewer = viewerOf(authentication);
		String etag = "\"" + hash + "\"";
		if (etag.equals(ifNoneMatch)) {
			// answered from the URL alone, a taken-down photo revalidated as 304 forever.
			return photos.exists(viewer, new VenueId(venueId), contentHash)
					.<ResponseEntity<?>>map(audience -> ResponseEntity.status(HttpStatus.NOT_MODIFIED)
							.cacheControl(cacheControlFor(audience))
							.header(HttpHeaders.ETAG, etag)
							.build())
					.orElseGet(() -> ResponseEntity.notFound().build());
		}
		Optional<ServedPhoto> found = photos.serve(viewer, new VenueId(venueId), contentHash);
		if (found.isEmpty()) {
			return ResponseEntity.notFound().build();
		}
		StoredBytes bytes = found.get().bytes();
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(bytes.contentType()))
				.cacheControl(cacheControlFor(found.get().audience()))
				.header(HttpHeaders.ETAG, etag)
				.body(bytes.bytes());
	}

	/** An admin outranks its own operator role: it may preview any venue, not only the ones it owns. */
	private PhotoViewer viewerOf(Authentication authentication) {
		return currentOperator.optional(authentication)
				.map(operator -> currentOperator.isAdmin(authentication)
						? PhotoViewer.admin()
						: PhotoViewer.operator(operator))
				.orElseGet(PhotoViewer::anonymous);
	}

	private static CacheControl cacheControlFor(PhotoAudience audience) {
		return switch (audience) {
			case PUBLIC -> REVALIDATE;
			case PRIVATE -> REVALIDATE_PRIVATE;
		};
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
