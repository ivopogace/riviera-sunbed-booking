import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { whenSheetOpened } from '../../../testing/sheet-opened';
import { DiscoverSheet } from './discover-sheet';
import { offsetFor } from './sheet-geometry';

/**
 * The sheet in jsdom, which lays nothing out: what can be proven here is the state machine —
 * the rest a press asks for, the detent the scroll position names, the pill's presence, the lift
 * handed between the translate and the list's real scroll position. The rest points themselves
 * are `sheet-geometry.spec.ts`'s; the rendered geometry is `discover-sheet.e2e.ts`'s.
 */
@Component({
  imports: [DiscoverSheet],
  template: `
    <app-discover-sheet>
      <div sheetHead data-testid="head-slot">Himarë</div>
      <ul>
        <li data-row="1">One</li>
        <li data-row="2">Two</li>
        <li data-row="3">Three</li>
      </ul>
    </app-discover-sheet>
  `,
})
class Host {
  readonly sheet = viewChild.required(DiscoverSheet);
}

describe('DiscoverSheet', () => {
  let fixture: ComponentFixture<Host>;
  /** Every `scrollTo` the sheet asked its outer scroller for, in order. */
  let asked: number[];
  const scrollable = Element.prototype as {
    scrollTo?: (options: ScrollToOptions) => void;
  };
  const originalScrollTo = scrollable.scrollTo;

  beforeEach(async () => {
    asked = [];
    // jsdom has no scrollTo; this stand-in lands the scroll and reports it as a browser would.
    scrollable.scrollTo = function scrollToStub(this: HTMLElement, options: ScrollToOptions) {
      const top = options.top ?? 0;
      asked.push(top);
      this.scrollTop = top;
      this.dispatchEvent(new Event('scroll'));
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await settle();
    await whenSheetOpened(fixture);
  });

  afterEach(() => {
    scrollable.scrollTo = originalScrollTo;
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(id: string): HTMLElement | null {
    return el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function scroller(): HTMLElement {
    return byTestId('sheet-scroller')!;
  }

  function sheet(): DiscoverSheet {
    return fixture.componentInstance.sheet();
  }

  it('opens at half, resting the outer scroller at the half offset once rendered', () => {
    const tops = sheet().tops();
    expect(asked[0]).toBe(tops.peek - tops.half);
    expect(scroller().dataset['detent']).toBe('half');
    expect(sheet().detent()).toBe('half');
  });

  it('projects the head into the sheet head and the rows into the list', () => {
    expect(byTestId('sheet-head')?.querySelector('[data-testid="head-slot"]')).not.toBeNull();
    expect(byTestId('sheet-list')?.querySelectorAll('[data-row]').length).toBe(3);
  });

  it('is two scroll-snap scrollers: the outer snaps at peek, half and full; the list scrolls only at full', () => {
    const outer = scroller();
    for (const cls of ['snap-y', 'snap-mandatory', 'overflow-y-auto', 'overscroll-contain']) {
      expect(outer.classList.contains(cls), cls).toBe(true);
    }
    const targets = outer.querySelectorAll('.snap-start.snap-always');
    expect(targets.length).toBe(3);
    const list = byTestId('sheet-list')!;
    expect(list.classList.contains('overflow-clip')).toBe(true);
    expect(list.classList.contains('overflow-y-auto')).toBe(false);
    expect(list.classList.contains('pb-[68px]')).toBe(true);
  });

  it('cycles half and full from the grabber, never peek', async () => {
    const tops = sheet().tops();
    byTestId('sheet-grabber')!.click();
    await settle();
    expect(asked.at(-1)).toBe(tops.peek - tops.full);
    expect(sheet().detent()).toBe('full');
    expect(byTestId('sheet-list')!.classList.contains('overflow-y-auto')).toBe(true);

    byTestId('sheet-grabber')!.click();
    await settle();
    expect(asked.at(-1)).toBe(tops.peek - tops.half);
    expect(sheet().detent()).toBe('half');
  });

  it('reports opened before a spec drives it, and retakes no rest under the tap that follows', async () => {
    expect(sheet().opened()).toBe(true);
    const view = el().ownerDocument.defaultView!;
    const realFrame = view.requestAnimationFrame.bind(view);
    const held: FrameRequestCallback[] = [];
    // Frames are held rather than dropped, so the flush below is a retake's one chance to happen.
    view.requestAnimationFrame = (callback: FrameRequestCallback) => held.push(callback);

    try {
      byTestId('sheet-grabber')!.click();
      await settle();
      expect(sheet().detent()).toBe('full');
      const rests = asked.length;

      held.splice(0).forEach((callback) => callback(0));
      await settle();
      expect(asked.length, 'a frame after the tap asked for another rest').toBe(rests);
    } finally {
      view.requestAnimationFrame = realFrame;
    }

    expect(sheet().detent()).toBe('full');
    expect(byTestId('sheet-map-pill')).not.toBeNull();
  });

  it('names the grabber for every reader and exempts it from the touch floor with its reason', () => {
    const grabber = byTestId('sheet-grabber')!;
    expect(grabber.getAttribute('aria-label')).toBe('Resize the list');
    expect(grabber.dataset['touchExempt']).toContain('drag surface');
  });

  it('shows the Map pill at full only, 12 px above the measured tab bar, and returns to half from it', async () => {
    expect(byTestId('sheet-map-pill')).toBeNull();
    sheet().go('full');
    await settle();
    const pill = byTestId('sheet-map-pill')!;
    expect(pill.textContent?.trim()).toContain('Map');
    expect(pill.parentElement?.style.bottom).toBe(`${sheet().chrome().tabBar + 12}px`);

    pill.click();
    await settle();
    expect(sheet().detent()).toBe('half');
    expect(byTestId('sheet-map-pill')).toBeNull();
  });

  it('names the nearest rest while a drag is between two rests', () => {
    const tops = sheet().tops();
    const halfOffset = tops.peek - tops.half;
    scroller().scrollTop = halfOffset / 2 - 1;
    scroller().dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(sheet().detent()).toBe('peek');
    expect(scroller().dataset['detent']).toBe('peek');
  });

  it('lifts a revealed row to the list top below full, clamped to the list end', async () => {
    const list = byTestId('sheet-list')!;
    const lifted = list.firstElementChild as HTMLElement;
    const row = list.querySelector<HTMLElement>('[data-row="3"]')!;
    list.getBoundingClientRect = () => new DOMRect(0, 380, 390, 464);
    row.getBoundingClientRect = () => new DOMRect(0, 1180, 390, 120);
    Object.defineProperty(lifted, 'offsetHeight', { value: 1500, configurable: true });

    sheet().reveal(row);
    await settle();

    // 1180 − 380 − 8 = 792 wanted, inside the ceiling: the list's overflow at full, the real scroller's own clamp.
    expect(sheet().lift()).toBe(792);
    expect(lifted.style.translate).toBe('0 -792px');

    row.getBoundingClientRect = () => new DOMRect(0, 2000, 390, 120);
    sheet().reveal(row);
    await settle();
    expect(sheet().lift()).toBe(1500 + 68 - (sheet().tops().sheetHeight - 78));
  });

  it('hands the lift to the list’s real scroll position at full, and takes it back on the way down', async () => {
    const list = byTestId('sheet-list')!;
    const lifted = list.firstElementChild as HTMLElement;
    const row = list.querySelector<HTMLElement>('[data-row="2"]')!;
    list.getBoundingClientRect = () => new DOMRect(0, 380, 390, 464);
    row.getBoundingClientRect = () => new DOMRect(0, 700, 390, 120);
    Object.defineProperty(lifted, 'offsetHeight', { value: 1500, configurable: true });
    sheet().reveal(row);
    await settle();
    expect(sheet().lift()).toBe(312);

    sheet().go('full');
    await settle();
    expect(list.scrollTop).toBe(312);
    expect(lifted.style.translate).toBe('');

    list.scrollTop = 150;
    sheet().go('half');
    await settle();
    expect(sheet().lift()).toBe(150);
    expect(lifted.style.translate).toBe('0 -150px');
  });

  it('reveals a row at full by scrolling the list itself', async () => {
    const list = byTestId('sheet-list')!;
    const row = list.querySelector<HTMLElement>('[data-row="2"]')!;
    sheet().go('full');
    await settle();
    list.getBoundingClientRect = () => new DOMRect(0, 117, 390, 727);
    row.getBoundingClientRect = () => new DOMRect(0, 517, 390, 120);

    sheet().reveal(row);
    await settle();

    expect(list.scrollTop).toBe(392);
  });

  it('keeps the detent across a re-measure once opened, resting at its new offset', async () => {
    const window = el().ownerDocument.defaultView!;
    sheet().go('full');
    await settle();
    await nextFrame(window);
    expect(sheet().detent()).toBe('full');

    Object.defineProperty(window, 'innerHeight', {
      value: window.innerHeight - 60,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    await settle();

    expect(sheet().detent()).toBe('full');
    expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'full'));
  });

  function nextFrame(window: Window): Promise<void> {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
});
