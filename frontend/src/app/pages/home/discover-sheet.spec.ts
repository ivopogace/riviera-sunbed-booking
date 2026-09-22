import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { whenSheetOpened } from '../../../testing/sheet-opened';
import { whenSheetSettled } from '../../../testing/sheet-settled';
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

  /** A touch event carrying the fingers still on the glass, which is what the sheet reads. */
  function touch(type: 'touchstart' | 'touchend', remaining: number): Event {
    const event = new Event(type);
    Object.defineProperty(event, 'touches', { value: { length: remaining } });
    return event;
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

  it('reports opened before a spec drives it, so the tap that follows stands', async () => {
    expect(sheet().opened()).toBe(true);

    byTestId('sheet-grabber')!.click();
    await settle();

    expect(sheet().detent()).toBe('full');
    expect(byTestId('sheet-map-pill')).not.toBeNull();
  });

  it('retakes the opening rest over a tap that lands before it, which is why a spec waits', async () => {
    // Characterises the window, never requires it: a `rest()` that stopped retaking fails here.
    const realFrame = globalThis.requestAnimationFrame.bind(globalThis);
    const held: FrameRequestCallback[] = [];
    // Angular's scheduler holds frames on this global too; re-running its legs is a no-op for it.
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => held.push(callback);

    try {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
      fixture = TestBed.createComponent(Host);
      await settle();
      expect(sheet().opened()).toBe(false);

      byTestId('sheet-grabber')!.click();
      await settle();
      expect(sheet().detent()).toBe('full');
      expect(byTestId('sheet-map-pill')).not.toBeNull();

      held.splice(0).forEach((callback) => callback(0));
      await settle();
    } finally {
      globalThis.requestAnimationFrame = realFrame;
    }

    expect(sheet().detent()).toBe('half');
    expect(byTestId('sheet-map-pill')).toBeNull();
  });

  it('abandons a rest a re-measure has superseded, instead of pulling the sheet back', async () => {
    const realFrame = globalThis.requestAnimationFrame.bind(globalThis);
    const held: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => held.push(callback);
    const view = el().ownerDocument.defaultView!;
    const innerHeight = view.innerHeight;

    try {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
      fixture = TestBed.createComponent(Host);
      await settle();

      // The viewport moves while the first rest is still unconfirmed, so a second rest supersedes it.
      Object.defineProperty(view, 'innerHeight', { value: innerHeight - 60, configurable: true });
      view.dispatchEvent(new Event('resize'));
      await whenSheetSettled(fixture);
      expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'half'));
      asked.length = 0;

      held.splice(0).forEach((callback) => callback(0));
      await settle();

      expect(asked, 'a superseded rest scrolled the sheet').toEqual([]);
      expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'half'));
    } finally {
      globalThis.requestAnimationFrame = realFrame;
      Object.defineProperty(view, 'innerHeight', {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('lets a Show map press supersede a re-measure rest still confirming itself', async () => {
    sheet().go('full');
    await settle();
    await whenSheetSettled(fixture);
    const realFrame = globalThis.requestAnimationFrame.bind(globalThis);
    const held: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => held.push(callback);
    const view = el().ownerDocument.defaultView!;
    const innerHeight = view.innerHeight;

    try {
      // The phone's URL bar moves at full: the sheet re-rests there, its confirmation a frame away.
      Object.defineProperty(view, 'innerHeight', { value: innerHeight - 60, configurable: true });
      view.dispatchEvent(new Event('resize'));
      await whenSheetSettled(fixture);
      expect(sheet().detent()).toBe('full');

      byTestId('sheet-map-pill')!.click();
      await settle();
      expect(sheet().detent()).toBe('peek');
      asked.length = 0;

      held.splice(0).forEach((callback) => callback(0));
      await settle();

      expect(asked, 'the superseded rest pulled the sheet back to full').toEqual([]);
      expect(sheet().detent()).toBe('peek');
    } finally {
      globalThis.requestAnimationFrame = realFrame;
      Object.defineProperty(view, 'innerHeight', {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('rests at the offset that collides with the not-yet-rested sentinel', async () => {
    const view = el().ownerDocument.defaultView!;
    const innerHeight = view.innerHeight;
    // 384 − HEAD_PX − HALF_MAP_BAND_PX is −1 with no shell around the Host: the sentinel's value.
    Object.defineProperty(view, 'innerHeight', { value: 384, configurable: true });

    try {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
      fixture = TestBed.createComponent(Host);
      await settle();
      await whenSheetOpened(fixture);

      // The half rest sits a pixel below peek here, so what matters is that it rests at all.
      expect(offsetFor(sheet().tops(), 'half')).toBe(-1);
      expect(asked).toContain(-1);
      expect(scroller().scrollTop).toBe(-1);
    } finally {
      Object.defineProperty(view, 'innerHeight', {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('names the grabber for every reader and exempts it from the touch floor with its reason', () => {
    const grabber = byTestId('sheet-grabber')!;
    expect(grabber.getAttribute('aria-label')).toBe('Resize the list');
    expect(grabber.dataset['touchExempt']).toContain('drag surface');
  });

  it('shows the Map pill at full only, 12 px above the measured tab bar, and drops to peek from it', async () => {
    expect(byTestId('sheet-map-pill')).toBeNull();
    sheet().go('full');
    await settle();
    const pill = byTestId('sheet-map-pill')!;
    expect(pill.textContent?.trim()).toBe('Show map');
    expect(pill.parentElement?.style.bottom).toBe(`${sheet().chrome().tabBar + 12}px`);

    pill.click();
    await settle();
    expect(sheet().detent()).toBe('peek');
    expect(byTestId('sheet-map-pill')).toBeNull();
  });

  it("turns snapping off under a press's glide and back on once it goes quiet", async () => {
    sheet().go('full');
    await settle();
    await whenSheetSettled(fixture);
    expect(scroller().style.scrollSnapType).toBe('');

    byTestId('sheet-map-pill')!.click();
    await settle();
    // WebKit re-snaps to the sheet's last rest (full) when the layout flips mid-glide; nothing to snap to, nothing to pull back.
    expect(scroller().style.scrollSnapType).toBe('none');

    await whenSheetSettled(fixture);
    expect(scroller().style.scrollSnapType).toBe('');
    expect(sheet().detent()).toBe('peek');
  });

  /** One finger at `y` (and `x`), at `t` ms, as the sheet's drag reads it. */
  function finger(
    type: 'touchstart' | 'touchmove' | 'touchend',
    y: number,
    t: number,
    x = 200,
  ): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
    Object.defineProperty(event, 'touches', { value: touches });
    Object.defineProperty(event, 'timeStamp', { value: t });
    return event;
  }

  /** A finger from `fromY` to `toY` over `ms`, in ten moves, on `target`. */
  async function dragOn(
    target: HTMLElement,
    fromY: number,
    toY: number,
    ms: number,
  ): Promise<Event[]> {
    const moves: Event[] = [];
    target.dispatchEvent(finger('touchstart', fromY, 0));
    for (let step = 1; step <= 10; step += 1) {
      const move = finger('touchmove', fromY + ((toY - fromY) * step) / 10, (ms * step) / 10);
      moves.push(move);
      target.dispatchEvent(move);
    }
    target.dispatchEvent(finger('touchend', toY, ms));
    await settle();
    return moves;
  }

  it("drags the sheet from half down to peek, which the grabber's tap never reaches", async () => {
    const moves = await dragOn(byTestId('sheet-grabber')!, 400, 600, 600);
    // The browser's own scroll is kept out, or iOS Safari hands the drag to pull-to-refresh.
    expect(moves.every((move) => move.defaultPrevented)).toBe(true);
    await whenSheetSettled(fixture);
    expect(sheet().detent()).toBe('peek');
    expect(scroller().scrollTop).toBe(0);
  });

  it('carries a fling from full down to half and no further', async () => {
    sheet().go('full');
    await settle();
    await dragOn(byTestId('sheet-head')!, 200, 300, 50);
    await whenSheetSettled(fixture);
    expect(sheet().detent()).toBe('half');
  });

  it("takes a drag down from the list's top at full, and leaves the list its own scroll", async () => {
    sheet().go('full');
    await settle();
    await whenSheetSettled(fixture);
    const list = byTestId('sheet-list')!;

    const up = await dragOn(list, 500, 300, 400);
    expect(up.some((move) => move.defaultPrevented)).toBe(false);
    expect(sheet().detent()).toBe('full');

    list.scrollTop = 40;
    const scrolledDown = await dragOn(list, 300, 500, 400);
    expect(scrolledDown.some((move) => move.defaultPrevented)).toBe(false);
    expect(sheet().detent()).toBe('full');

    list.scrollTop = 0;
    const pulled = await dragOn(list, 300, 520, 600);
    expect(pulled.every((move) => move.defaultPrevented)).toBe(true);
    await whenSheetSettled(fixture);
    expect(sheet().detent()).toBe('half');
  });

  it('leaves a sideways touch to the browser: a rail or a photo', async () => {
    const head = byTestId('sheet-head')!;
    const from = scroller().scrollTop;
    head.dispatchEvent(finger('touchstart', 400, 0, 100));
    const sideways = finger('touchmove', 405, 20, 160);
    head.dispatchEvent(sideways);
    head.dispatchEvent(finger('touchmove', 440, 40, 220));
    head.dispatchEvent(finger('touchend', 440, 60, 220));
    await settle();
    expect(sideways.defaultPrevented).toBe(false);
    expect(scroller().scrollTop).toBe(from);
  });

  it('keeps snapping off under the finger for as long as the drag holds, however still', async () => {
    const head = byTestId('sheet-head')!;
    head.dispatchEvent(finger('touchstart', 400, 0));
    head.dispatchEvent(finger('touchmove', 450, 20));
    await settle();
    expect(scroller().style.scrollSnapType).toBe('none');
    // Outlast the quiet window with the finger held: a snap here would yank the sheet from it.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await settle();
    expect(scroller().style.scrollSnapType).toBe('none');
    head.dispatchEvent(finger('touchend', 450, 400));
    await settle();
    await whenSheetSettled(fixture);
    expect(scroller().style.scrollSnapType).toBe('');
  });

  it('keeps the guard while a second finger is still on the glass', async () => {
    const window = el().ownerDocument.defaultView!;
    const innerHeight = window.innerHeight;
    await whenSheetSettled(fixture);
    asked.length = 0;

    try {
      byTestId('sheet')!.dispatchEvent(touch('touchstart', 1));
      byTestId('sheet')!.dispatchEvent(touch('touchstart', 2));
      // One finger lifts; `touchend` fires per changed touch, not when the last one leaves.
      byTestId('sheet')!.dispatchEvent(touch('touchend', 1));
      Object.defineProperty(window, 'innerHeight', {
        value: innerHeight - 60,
        configurable: true,
      });
      window.dispatchEvent(new Event('resize'));
      await settle();

      expect(asked, 'a re-measure rested under the remaining finger').toEqual([]);

      byTestId('sheet')!.dispatchEvent(touch('touchend', 0));
      await whenSheetSettled(fixture);
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }

    expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'half'));
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
    await whenSheetSettled(fixture);

    expect(sheet().detent()).toBe('full');
    expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'full'));
  });

  /**
   * A phone fires `resize` mid-gesture every time its URL bar or on-screen keyboard moves.
   * Resting on that scrolls the sheet out from under the finger, which is the drag that fights
   * back; the rest is owed all the same, so it is taken once the finger lifts.
   */
  it('leaves a re-measure taken under a finger alone, and rests once the finger lifts', async () => {
    const window = el().ownerDocument.defaultView!;
    const innerHeight = window.innerHeight;
    sheet().go('full');
    await settle();
    await whenSheetSettled(fixture);
    const restedAt = scroller().scrollTop;
    asked.length = 0;

    try {
      byTestId('sheet')!.dispatchEvent(touch('touchstart', 1));
      Object.defineProperty(window, 'innerHeight', {
        value: innerHeight - 60,
        configurable: true,
      });
      window.dispatchEvent(new Event('resize'));
      await settle();

      expect(asked, 'a re-measure scrolled the sheet under the finger').toEqual([]);
      expect(scroller().scrollTop).toBe(restedAt);

      byTestId('sheet')!.dispatchEvent(touch('touchend', 0));
      await whenSheetSettled(fixture);
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }

    // The rest the re-measure asked for is not lost, only held: it lands at the new geometry.
    expect(sheet().detent()).toBe('full');
    expect(scroller().scrollTop).toBe(offsetFor(sheet().tops(), 'full'));
  });

  function nextFrame(window: Window): Promise<void> {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
});
