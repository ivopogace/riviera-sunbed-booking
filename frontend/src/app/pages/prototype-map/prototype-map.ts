import { Component, inject } from '@angular/core';

import { PrototypeState } from './prototype-state';
import { PrototypeSwitcher } from './prototype-switcher';
import { VariantBay } from './variant-bay';
import { VariantDrive } from './variant-drive';
import { VariantGazetteer } from './variant-gazetteer';
import { VariantThumb } from './variant-thumb';

/**
 * PROTOTYPE — throwaway route `/prototype/map-desktop?variant=a|b|c|d`. Four answers to one
 * question: where does the riviera map belong on Discover, and what is the page for once it is
 * there? Nothing here is tested, error-handled or meant to merge; the findings are in
 * `README.md` beside it and only a decision graduates.
 *
 * <p>`--riv-proto-h` is the page's own height budget — the viewport less the shell's chrome, as
 * MEASURED in the running app rather than assumed: the header is 73 px at every width, and below
 * `sm` the phone tab bar adds 61 px (60 px of tabs plus its top border; the 76 px figure elsewhere
 * in the shell is the mobile menu's clearance above it, not the bar). Every variant lays out
 * inside this box, so none of them scrolls the document and each screenshot is exactly one screen.
 */
@Component({
  selector: 'app-prototype-map',
  imports: [VariantBay, VariantDrive, VariantGazetteer, VariantThumb, PrototypeSwitcher],
  providers: [PrototypeState],
  host: { class: 'block' },
  template: `
    <div
      class="[--riv-proto-h:calc(100dvh-134px)] sm:[--riv-proto-h:calc(100dvh-73px)]"
      data-testid="prototype-map"
    >
      @switch (state.variant()) {
        @case ('a') {
          <app-variant-bay />
        }
        @case ('b') {
          <app-variant-drive />
        }
        @case ('c') {
          <app-variant-gazetteer />
        }
        @default {
          <app-variant-thumb />
        }
      }
    </div>
    <app-prototype-switcher />
  `,
})
export class PrototypeMap {
  protected readonly state = inject(PrototypeState);
}
