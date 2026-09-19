/** PROTOTYPE — throwaway. The variant switcher: deliberately ugly so it reads as scaffolding. */
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, input, output } from '@angular/core';

export interface PrototypeVariant {
  readonly key: string;
  readonly name: string;
  /** One line on what this layout claims — shown in the bar so the screenshot carries its thesis. */
  readonly claim: string;
}

@Component({
  selector: 'app-prototype-switcher',
  host: {
    class:
      'fixed top-2.5 left-1/2 z-[999] -translate-x-1/2 flex items-center gap-1 rounded-full ' +
      'border-2 border-[#1f2937] bg-[#0b1220] px-2 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ' +
      'lg:top-auto lg:bottom-4 lg:py-1.5',
  },
  template: `
    <button
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-[18px] leading-none text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      aria-label="Previous variant"
      (click)="step(-1)"
    >
      <span aria-hidden="true">‹</span>
    </button>
    <p class="px-2 text-center font-mono text-[12px] leading-[1.35] text-white">
      <strong class="text-[13px]">{{ current().key }} · {{ current().name }}</strong>
      <span class="hidden text-white/60 lg:block">{{ current().claim }}</span>
    </p>
    <button
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-[18px] leading-none text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      aria-label="Next variant"
      (click)="step(1)"
    >
      <span aria-hidden="true">›</span>
    </button>
  `,
})
export class PrototypeSwitcher {
  readonly variants = input.required<readonly PrototypeVariant[]>();
  readonly currentKey = input.required<string>();
  readonly picked = output<string>();

  constructor() {
    const doc = inject(DOCUMENT);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (event.key === 'ArrowLeft') this.step(-1);
      if (event.key === 'ArrowRight') this.step(1);
    };
    doc.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('keydown', onKey));
  }

  protected current(): PrototypeVariant {
    const list = this.variants();
    return list.find((v) => v.key === this.currentKey()) ?? list[0];
  }

  protected step(by: number): void {
    const list = this.variants();
    const at = list.findIndex((v) => v.key === this.current().key);
    this.picked.emit(list[(at + by + list.length) % list.length].key);
  }
}
