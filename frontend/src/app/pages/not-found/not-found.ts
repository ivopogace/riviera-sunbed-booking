import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { TouchTarget } from '../../shared/touch-target';

/**
 * The app-wide answer to a URL no route matches (`**`, last in `app.routes.ts`), in the tourist
 * shell. The typed URL stays in the address bar so the visitor can see and fix the typo.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, CardGlass, TouchTarget],
  template: `
    <section
      class="mx-auto my-8 max-w-[460px] rounded-[28px] px-[30px] py-10 text-center shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[170%]"
      appCardGlass
      aria-labelledby="not-found-title"
    >
      <h1
        id="not-found-title"
        class="mx-0 mt-0 mb-2 text-[22px] font-bold tracking-[-0.02em] text-riv-card-ink"
      >
        Page not found
      </h1>
      <p class="mx-0 mt-0 mb-[18px] text-[14.5px] leading-[1.5] text-riv-card-ink-soft">
        There’s no page at this address. Check the link, or head back to the beaches.
      </p>
      <a
        appTouchTarget
        routerLink="/"
        class="inline-flex items-center text-[14.5px] font-semibold text-riv-accent-ink underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
        data-testid="not-found-home"
        >Back to the beaches</a
      >
    </section>
  `,
})
export class NotFound {}
