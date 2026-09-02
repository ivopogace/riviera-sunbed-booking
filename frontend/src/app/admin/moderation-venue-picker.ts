import { Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { AdminVenuesService, ModerationVenue } from './admin-venues.service';

/**
 * The venue-picker half every moderation tab shares: the platform-wide venue list, loaded once the
 * admin session is confirmed; which venue is on screen; and the bookkeeping that keeps a venue's
 * reads honest across a switch — a generation counter that retires whatever load was in flight, and
 * the "still viewing" test an action's outcome must pass before it narrates under a venue's name.
 *
 * The staleness test is the counter, not the selected venue id, and the difference is not academic:
 * an id check calls a response current whenever its venue is on screen, so leaving a venue and coming
 * back re-requests it and the *older* of the two answers can land last and win. Only "is this the
 * newest request I issued" is monotonic. Abandoning a load also clears `loading`: deselecting back
 * to "Choose a venue…" issues no new request, so nothing else would ever turn the spinner off.
 */
export interface ModerationVenuePicker {
  readonly venues: Signal<readonly ModerationVenue[]>;
  readonly selectedVenueId: Signal<number | undefined>;
  readonly selectedVenue: Signal<ModerationVenue | undefined>;
  /** The selected venue's read in flight — the tab's own per-venue load drives it. */
  readonly loading: WritableSignal<boolean>;
  /** The last load — of the list or of a venue — failed and the tab shows its retry. */
  readonly loadError: WritableSignal<boolean>;
  /** Move to the venue the `<select>` now names, retiring any load in flight; `undefined` is "Choose a venue…". */
  pick(event: Event): number | undefined;
  /** Open one read of the selected venue and take its ticket; {@link isCurrent} says whether it is still the newest. */
  beginLoad(): number;
  isCurrent(ticket: number): boolean;
  /** Whether `venue` is still the one on screen — an outcome that settled under another's name stays silent. */
  isViewing(venue: ModerationVenue): boolean;
}

/**
 * A factory rather than a base class (the `focusMover()` shape): it runs in the component's
 * injection context, so a tab composes it as a field and reads its signals from its own template.
 */
export function moderationVenuePicker(): ModerationVenuePicker {
  const auth = inject(OperatorAuth);
  const venueList = inject(AdminVenuesService);
  const venues = signal<readonly ModerationVenue[]>([]);
  const selectedVenueId = signal<number | undefined>(undefined);
  const loading = signal(false);
  const loadError = signal(false);
  let loaded = false;
  let generation = 0;

  async function loadVenues(): Promise<void> {
    try {
      venues.set(await venueList.venues());
    } catch {
      loadError.set(true);
    }
  }

  // Load the venue list once the admin session is confirmed (restore settled + ROLE_ADMIN present).
  effect(() => {
    if (!auth.restoring() && auth.isAdmin() && !loaded) {
      loaded = true;
      void loadVenues();
    }
  });

  function abandonInFlightLoad(): void {
    generation++;
    loading.set(false);
    loadError.set(false);
  }

  return {
    venues: venues.asReadonly(),
    selectedVenueId: selectedVenueId.asReadonly(),
    selectedVenue: computed(() => venues().find((venue) => venue.id === selectedVenueId())),
    loading,
    loadError,
    pick(event: Event): number | undefined {
      const value = (event.target as HTMLSelectElement).value;
      abandonInFlightLoad();
      const id = value === '' ? undefined : Number(value);
      selectedVenueId.set(id);
      return id;
    },
    beginLoad: () => ++generation,
    isCurrent: (ticket) => ticket === generation,
    isViewing: (venue) => selectedVenueId() === venue.id,
  };
}
