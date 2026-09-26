package ai.riviera.platform.venue.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.venue.application.VenuePhotoModeration;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin photo moderation surface, the "remove" half of report-and-remove (ADR-0013).
 * Role-gated, not venue-scoped: the operator path's ownership check would 403 exactly the case
 * moderation exists for, so this lives under {@code /api/admin/**}, exempt from invariant #13, and
 * the {@code ADMIN} gate in {@code SecurityConfig} is the whole authorization. The path mirrors the
 * operator's but for the prefix. An empty slot, a photo-less venue and an unknown venue all answer
 * {@code 404 NO_SUCH_PHOTO}, indistinguishably.
 */
@RestController
@RequestMapping("/api/admin/venues")
class AdminVenuePhotoController {

	private final VenuePhotoModeration moderation;

	AdminVenuePhotoController(VenuePhotoModeration moderation) {
		this.moderation = moderation;
	}

	/**
	 * The read that makes the takedown below operable — every slot of any venue, ownership-free.
	 * Always {@code 200}: an unknown venue answers three empty slots rather than {@code 404}, matching
	 * the takedown's refusal to distinguish an unknown venue from an empty slot.
	 */
	@GetMapping("/{venueId}/photos")
	AdminVenuePhotosResponse photos(@PathVariable long venueId) {
		return AdminVenuePhotosResponse.from(venueId, moderation.slotsOf(new VenueId(venueId)));
	}

	@DeleteMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> remove(@PathVariable long venueId, @PathVariable String slot) {
		return moderation.takedown(new VenueId(venueId), PhotoSlots.parse(slot))
				? ResponseEntity.noContent().build()
				: ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_PHOTO", "No photo in this slot.");
	}
}
