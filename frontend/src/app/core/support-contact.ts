import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { SupportContactView } from '../shared/support-contact-view';

/**
 * The one support-contact source the help page, the booking view and the console account menu read.
 * Fetched on the first {@link load}, never at boot, so a page that shows no contact makes no request;
 * a failed read leaves {@link contact} undefined (every surface then renders no channel) and is retried
 * on the next {@link load}.
 */
@Service()
export class SupportContact {
  private readonly http = inject(HttpClient);
  private readonly loaded = signal<SupportContactView | undefined>(undefined);
  private inFlight?: Promise<void>;

  /** The configured channels, or undefined before the first successful read. */
  readonly contact = this.loaded.asReadonly();

  load(): Promise<void> {
    this.inFlight ??= this.fetch();
    return this.inFlight;
  }

  private async fetch(): Promise<void> {
    try {
      this.loaded.set(
        await firstValueFrom(
          this.http.get<SupportContactView>(`${environment.apiBaseUrl}/api/support-contact`),
        ),
      );
    } catch {
      this.inFlight = undefined;
    }
  }
}
