import { Component, computed, inject } from '@angular/core';

import { SupportContact } from '../../core/support-contact';
import { CardGlass } from '../../shared/card-glass';
import { SupportChannels } from '../../shared/support-channels';
import { hasSupportChannel } from '../../shared/support-contact-view';

/**
 * The help page at `/help`: how booking, cancelling and arrival work, then the configured support
 * channels. Restates no venue-specific clock time or refund figure (#4, #10: the booking shows its
 * own). With no channel configured the contact section is absent, never a placeholder; the same-day
 * promise shows only when the server says today is in season.
 */
@Component({
  selector: 'app-help-page',
  imports: [CardGlass, SupportChannels],
  templateUrl: './help-page.html',
})
export class HelpPage {
  private readonly support = inject(SupportContact);

  protected readonly contact = this.support.contact;
  protected readonly hasChannel = computed(() => hasSupportChannel(this.contact()));

  constructor() {
    void this.support.load();
  }
}
