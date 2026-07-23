import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/** One venue the signed-in operator owns, as `GET /api/venues/mine` returns it (S9 #277). */
export interface OwnedVenue {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
}

/**
 * How an owned-venues read ended. `error` is deliberately distinct from an empty `loaded` list: a
 * transient failure must never be mistaken for "owns no venues", which would forward a real operator
 * to venue onboarding on a network blip.
 */
export type OwnedVenuesResult =
  | { readonly status: 'loaded'; readonly venues: readonly OwnedVenue[] }
  | { readonly status: 'error' };

/**
 * The signed-in operator's own venues (S9 #277) — the read behind the post-sign-in landing decision
 * and the `/operator` picker. Session-scoped at the backend (no id in the request), so this service
 * has no parameters and nothing to authorize client-side.
 *
 * Cached for the session: the landing resolver, the guard and the picker all ask for the same list
 * within a few hundred milliseconds of each other. {@link reset} clears it — call it on sign-out, or
 * the next operator to sign in on this device would be shown the previous one's venues.
 */
@Service()
export class OwnedVenues {
  private readonly http = inject(HttpClient);
  private readonly loaded = signal<readonly OwnedVenue[] | undefined>(undefined);
  private inFlight?: Promise<OwnedVenuesResult>;

  /** The last successfully loaded list, or undefined before the first load / after a failure. */
  readonly venues = this.loaded.asReadonly();

  /** Fetch the operator's venues, sharing one request between concurrent callers. */
  load(): Promise<OwnedVenuesResult> {
    this.inFlight ??= this.fetch();
    return this.inFlight;
  }

  /** Drop the cache so the next {@link load} refetches (sign-out, or after creating a venue). */
  reset(): void {
    this.inFlight = undefined;
    this.loaded.set(undefined);
  }

  private async fetch(): Promise<OwnedVenuesResult> {
    try {
      const venues = await firstValueFrom(
        this.http.get<OwnedVenue[]>(`${environment.apiBaseUrl}/api/venues/mine`),
      );
      this.loaded.set(venues);
      return { status: 'loaded', venues };
    } catch {
      this.inFlight = undefined; // a failure is not cached, so the caller can retry
      this.loaded.set(undefined);
      return { status: 'error' };
    }
  }
}
