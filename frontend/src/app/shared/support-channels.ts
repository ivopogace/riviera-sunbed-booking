import { Component, input } from '@angular/core';

import { SupportContactView } from './support-contact-view';
import { TouchTarget } from './touch-target';

/**
 * The configured support channels as a list of links, for card surfaces (the help page, the booking
 * view): a `mailto:` row and a plain `wa.me` row (no embed, no third-party script), each rendered only
 * when configured. The call site decides whether to render it at all (`hasSupportChannel`).
 */
@Component({
  selector: 'app-support-channels',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
    @if (contact().email; as email) {
      <li>
        <a
          appTouchTarget
          class="support-channel inline-flex items-center gap-1.5 text-[14.5px] font-semibold underline underline-offset-[3px]"
          [href]="'mailto:' + email"
          data-testid="support-email"
          ><span class="font-normal">Email</span> {{ email }}</a
        >
      </li>
    }
    @if (contact().whatsapp; as whatsapp) {
      <li>
        <a
          appTouchTarget
          class="support-channel inline-flex items-center gap-1.5 text-[14.5px] font-semibold underline underline-offset-[3px]"
          [href]="whatsapp.url"
          target="_blank"
          rel="noopener"
          data-testid="support-whatsapp"
          ><span class="font-normal">WhatsApp</span> {{ whatsapp.number }}</a
        >
      </li>
    }
  </ul>`,
})
export class SupportChannels {
  readonly contact = input.required<SupportContactView>();
}
