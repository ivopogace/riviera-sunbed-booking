/**
 * PROTOTYPE — throwaway. Four variants of Discover-with-the-map on the same route, switchable
 * via `?variant=`: three desktop-first (A wide chart + shelf, B coast spine, C bay by bay) and one
 * mobile-first (D thumb sheet). `pages/prototype-map/README.md` holds the question, the
 * measurements and the verdict. Nothing here merges to `main`.
 */
import { DOCUMENT } from '@angular/common';
import { Component, afterNextRender, computed, inject, signal } from '@angular/core';

import { ProtoState } from './proto-state';
import { ProtoSwitcher } from './proto-switcher';
import { VariantA } from './variant-a';
import { VariantB } from './variant-b';
import { VariantC } from './variant-c';
import { VariantD } from './variant-d';

@Component({
  selector: 'app-prototype-map',
  imports: [ProtoSwitcher, VariantA, VariantB, VariantC, VariantD],
  providers: [ProtoState],
  host: { class: 'block', '[style.--proto-top.px]': 'headerHeight()' },
  template: `
    @switch (variant()) {
      @case ('a') {
        <app-proto-variant-a (frame)="readout.set($event)" />
      }
      @case ('b') {
        <app-proto-variant-b (frame)="readout.set($event)" />
      }
      @case ('c') {
        <app-proto-variant-c (frame)="readout.set($event)" />
      }
      @case ('d') {
        <app-proto-variant-d (frame)="readout.set($event)" />
      }
    }
    <app-proto-switcher [current]="variant()" [readout]="readout()" />
  `,
})
export class PrototypeMap {
  private readonly state = inject(ProtoState);
  protected readonly variant = computed(() => this.state.params().variant);
  protected readonly readout = signal('');
  /** The shell's header height, so every variant can size itself to the rest of the viewport. */
  protected readonly headerHeight = signal(0);

  constructor() {
    const document = inject(DOCUMENT);
    const measure = (): void => {
      const header = document.querySelector('header.riv-header');
      const sticky = header && getComputedStyle(header).position === 'sticky';
      this.headerHeight.set(sticky ? header.getBoundingClientRect().height : 0);
    };
    measure();
    afterNextRender(measure);
  }
}
