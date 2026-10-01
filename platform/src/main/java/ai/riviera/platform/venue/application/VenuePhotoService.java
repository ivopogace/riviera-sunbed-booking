package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Orchestrates the venue-photo use cases: the {@link VenuePhotos} writes assert ownership first
 * (invariant #13), then run the pure {@link PhotoProcessor} and persist via {@link PhotoStorage};
 * the {@link #serve} read is fenced on tourist visibility, bypassed by an admin or the owner. Also
 * implements the ownership-free {@link VenuePhotoModeration} port, so admin removal reuses the one
 * {@code PhotoStorage#delete} call. Rationale: RESPONSIBILITIES.md §venue (ADR-0013).
 */
@Service
class VenuePhotoService implements VenuePhotos, VenuePhotoModeration {

	private final VenueOwnership ownership;
	private final VenueVisibility visibility;
	private final PhotoProcessor processor;
	private final PhotoStorage storage;

	VenuePhotoService(VenueOwnership ownership, VenueVisibility visibility, PhotoProcessor processor,
			PhotoStorage storage) {
		this.ownership = ownership;
		this.visibility = visibility;
		this.processor = processor;
		this.storage = storage;
	}

	@Override
	public PhotoUploadResult upload(OperatorId operator, VenueId venueId, PhotoSlot slot, byte[] image) {
		// Deliberately NOT @Transactional: the CPU-heavy image pipeline
		// must run OUTSIDE any DB transaction — a service-level tx would pin a pool connection
		// through a multi-second decode/resize of a 25MB upload and starve unrelated requests.
		// Atomicity lives where it's needed: the adapter's replace() is itself @Transactional.
		ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13 — FIRST, before any work
		return switch (processor.process(image)) {
			case PhotoProcessingResult.Processed(var photo) -> {
				storage.replace(venueId, slot, photo);
				yield new PhotoUploadResult.Stored(metadataOf(slot, photo));
			}
			case PhotoProcessingResult.Rejected(var reason) -> new PhotoUploadResult.Rejected(reason);
		};
	}

	@Override
	public boolean delete(OperatorId operator, VenueId venueId, PhotoSlot slot) {
		ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13 — FIRST
		// No tx needed here: the adapter's delete is one cascading DELETE statement (atomic on its own).
		return storage.delete(venueId, slot);
	}

	@Override
	public List<PhotoSlotView> slotsOf(VenueId venueId) {
		// No ownership check by design: the ADMIN role gate is this path's whole authorization.
		Map<PhotoSlot, String> previewBySlot = new EnumMap<>(PhotoSlot.class);
		for (PhotoMetadata photo : storage.listMetadata(venueId)) {
			photo.variants().stream()
					.filter(variant -> variant.surface() == PhotoSurface.PREVIEW)
					.findFirst()
					.ifPresent(variant -> previewBySlot.put(photo.slot(),
							PhotoServingUrls.servingUrl(venueId.value(), variant.hash())));
		}
		// Every slot, occupied or not, so the console renders a stable grid (null means empty).
		return Arrays.stream(PhotoSlot.values())
				.map(slot -> new PhotoSlotView(slot, previewBySlot.get(slot)))
				.toList();
	}

	@Override
	public boolean takedown(VenueId venueId, PhotoSlot slot) {
		// No ownership check by design: the ADMIN role gate is this path's whole authorization.
		return storage.delete(venueId, slot);
	}

	@Override
	public Optional<ServedPhoto> serve(PhotoViewer viewer, VenueId venueId, ContentHash hash) {
		return audienceFor(viewer, venueId)
				.flatMap(audience -> storage.loadBytes(venueId, hash).map(bytes -> new ServedPhoto(bytes, audience)));
	}

	@Override
	public Optional<PhotoAudience> exists(PhotoViewer viewer, VenueId venueId, ContentHash hash) {
		return audienceFor(viewer, venueId).filter(audience -> storage.exists(venueId, hash));
	}

	/** The serving fence: a visible venue is public; a hidden one only to an admin or its owner. */
	private Optional<PhotoAudience> audienceFor(PhotoViewer viewer, VenueId venueId) {
		VenueRef venue = new VenueRef(venueId.value());
		if (visibility.isVisible(venue)) {
			return Optional.of(PhotoAudience.PUBLIC);
		}
		boolean mayPreview = switch (viewer) {
			case PhotoViewer.Admin() -> true;
			case PhotoViewer.Operator(OperatorId operator) -> ownership.ownedVenues(operator).contains(venue);
			case PhotoViewer.Anonymous() -> false;
		};
		return mayPreview ? Optional.of(PhotoAudience.PRIVATE) : Optional.empty();
	}

	/** The stored photo's blob-free metadata (for the operator's immediate preview after upload). */
	private static PhotoMetadata metadataOf(PhotoSlot slot, ProcessedPhoto photo) {
		return new PhotoMetadata(slot, photo.variants().stream()
				.map(v -> new VariantMeta(v.surface(), v.scale(), v.hash(), v.contentType(), v.width(), v.height()))
				.toList());
	}
}
