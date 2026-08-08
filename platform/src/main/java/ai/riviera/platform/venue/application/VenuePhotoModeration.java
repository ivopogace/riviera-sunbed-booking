package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Platform moderation of venue photos — the "remove" half of the report-and-remove
 * moderation stance. Deliberately a <strong>separate port from {@link VenuePhotos}</strong>
 * rather than extra methods on it: {@code VenuePhotos} promises that its writes assert per-venue
 * ownership <em>first</em> (invariant #13), and an ownership-free method hung off it would turn that
 * promise into a per-method detail every caller has to re-read. It is also a different conversation —
 * platform moderation by an actor who owns nothing, not a venue managing its own profile.
 *
 * <p><strong>The contract is the port's, not any one method's: every method here is ownership-free
 * by design.</strong> Naming the port for that posture rather than for its one action is what lets
 * the moderation read join it (#511) without re-arguing the case — a moderator looks at a reported
 * photo and then removes it, one conversation with one actor and one authorization posture.
 *
 * <p>The driving adapter is {@code AdminVenuePhotoController}, gated to the {@code ADMIN} role in
 * {@code SecurityConfig}: that role gate is the <strong>whole</strong> authorization for this port,
 * which is why nothing else may depend on it. Implemented by {@code VenuePhotoService}, so the
 * removal runs through the one {@link PhotoStorage#delete} the operator path uses — the single
 * cascading statement that erases metadata and every variant together (ADR-0008), not a second
 * delete path that could drift from it.
 *
 * <p><strong>Scope is one slot, not one image.</strong> The variant pipeline is deterministic, so the
 * same source image uploaded into two slots of a venue yields byte-identical variants sharing a
 * {@code (venue, content_hash)}, and the content-addressed serving read takes any one of them
 * (#142 review F-2). Taking down one slot therefore leaves those bytes reachable while another slot
 * still publishes them; each published slot is its own takedown. Removing an image everywhere is not
 * this port's job.
 */
public interface VenuePhotoModeration {

	/**
	 * Every {@link PhotoSlot} of {@code venueId} in declaration order — an occupied slot carrying its
	 * PREVIEW variant's serving URL, an empty one carrying {@code null} — <strong>without any
	 * ownership check</strong>. Emptiness IS the null URL (#142 review F-11), so the caller
	 * gets a stable three-slot grid rather than a list it has to reconcile against the slot vocabulary.
	 *
	 * <p>This read exists because the only other per-slot view is the venue-scoped operator profile,
	 * which answers {@code 403 NOT_VENUE_OWNER} to a non-owner — refusing exactly the case moderation
	 * exists for. Without it an admin could delete a photo it had no way to look at first.
	 *
	 * <p>A venue with no photos and an unknown venue both answer three empty slots: the same
	 * deliberate blank {@link #takedown} draws, so the surface leaks no venue-existence signal.
	 */
	List<PhotoSlotView> slotsOf(VenueId venueId);

	/**
	 * Remove the photo in {@code slot} of {@code venueId} — metadata and every variant, one statement
	 * — <strong>without any ownership check</strong>. Returns {@code true} if a photo was there,
	 * {@code false} if the slot was empty or the venue has none (→ {@code 404}); an unknown venue is
	 * deliberately indistinguishable from an empty slot.
	 */
	boolean takedown(VenueId venueId, PhotoSlot slot);
}
