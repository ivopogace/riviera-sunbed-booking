import { VenueLocation } from './venue-views';

/**
 * A plain cross-platform maps link to `at`: Google's documented Maps URL, which opens the maps app
 * on a phone and the web map elsewhere. A link out, never an embed: nothing loads until the guest
 * follows it, so the self-hosted-tiles rule holds.
 */
export function directionsUrl(at: VenueLocation): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${at.latitude},${at.longitude}`;
}
