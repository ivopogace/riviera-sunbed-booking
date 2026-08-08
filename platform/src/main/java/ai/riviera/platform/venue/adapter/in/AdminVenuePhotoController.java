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
 * The platform-admin photo moderation surface — the "remove" half of the report-and-remove
 * moderation stance. Driving adapter depending only on the module's
 * {@link VenuePhotoModeration} port; hosted in the module rather than at the composition root, like
 * the other module-owned admin surfaces.
 *
 * <p><strong>Role-gated, not venue-scoped</strong> — and this endpoint is why that exemption matters.
 * A reported photo belongs to a venue the admin does not own, so the ownership assertion guarding
 * {@code DELETE /api/venues/{venueId}/photos/{slot}} refuses exactly the case moderation exists for
 * ({@code 403 NOT_VENUE_OWNER}, before the slot is even looked at). Living under {@code /api/admin/**}
 * takes the invariant-#13 exemption instead, and the {@code ADMIN} gate in {@code SecurityConfig} is
 * then the <strong>whole</strong> authorization: a plain {@code OPERATOR} is {@code 403}, anonymous
 * is {@code 401}. The operator's own delete/replace flow is untouched.
 *
 * <p>The path deliberately mirrors the operator's, differing only by the {@code /api/admin} prefix
 * that carries the authorization posture: the same operation under a different authority, which is
 * what it is. Errors are the one RFC-7807 contract — an empty slot, a venue with no
 * photos and an unknown venue all answer {@code 404 NO_SUCH_PHOTO}, so the surface distinguishes
 * none of them.
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
