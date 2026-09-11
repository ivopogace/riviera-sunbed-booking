import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { photoView, photoViews } from '../../testing/photo-views';

import { CONTAIN_SIZES } from './photo-url';

import { PhotoSlideshow } from './photo-slideshow';

const PHOTOS = [
  '/api/venues/1/photos/aa01',
  '/api/venues/1/photos/cc03',
  '/api/venues/1/photos/dd04',
];

describe('PhotoSlideshow', () => {
  let fixture: ComponentFixture<PhotoSlideshow>;

  function create(inputs: {
    photos: readonly string[];
    ownControls?: boolean;
    testId?: string;
    name?: string;
    startIndex?: number;
    contain?: boolean;
    priority?: boolean;
  }): void {
    fixture = TestBed.createComponent(PhotoSlideshow);
    fixture.componentRef.setInput('photos', photoViews(inputs.photos));
    for (const key of ['ownControls', 'testId', 'name', 'startIndex', 'contain', 'priority']) {
      const value = inputs[key as keyof typeof inputs];
      if (value !== undefined) {
        fixture.componentRef.setInput(key, value);
      }
    }
    fixture.detectChanges();
  }

  it('emits every candidate as a w-descriptor srcset the browser picks from', () => {
    fixture = TestBed.createComponent(PhotoSlideshow);
    fixture.componentRef.setInput('photos', [photoView('/api/venues/1/photos/aa01', 1152)]);
    fixture.componentRef.setInput('sizes', '30vw');
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    // src stays the baseline: it is what a client without srcset support fetches.
    expect(img.getAttribute('src')).toBe('/api/venues/1/photos/aa01');
    expect(img.getAttribute('srcset')).toBe(
      '/api/venues/1/photos/aa01 576w, /api/venues/1/photos/aa01@1152 1152w',
    );
    // Without this, a loader added later would silently overwrite the attribute above.
    expect(img.hasAttribute('disableOptimizedSrcset')).toBe(true);
    // The directive prefixes `auto,` on a lazy image, so a browser that measures the box wins.
    expect(img.getAttribute('sizes')).toBe('auto, 30vw');
  });

  it('carries every authored contain-fitted sizes through NgOptimizedImage untouched', () => {
    // The directive's dev-mode guards run on init, so a value it rejects fails here, not in prod.
    // Load-bearing since #1072: galleryHero's px survives assertNoComplexSizes only because that
    // guard's regex anchors on ') ', ', ' or start-of-string, so a px after '(' is unseen. An
    // Angular release that swaps the regex for a parser turns THIS red, naming the value.
    for (const value of Object.values(CONTAIN_SIZES)) {
      const surface = TestBed.createComponent(PhotoSlideshow);
      surface.componentRef.setInput('photos', [photoView('/api/venues/1/photos/aa01', 1152)]);
      surface.componentRef.setInput('sizes', value);

      expect(() => surface.detectChanges(), value).not.toThrow();
      const img = (surface.nativeElement as HTMLElement).querySelector('img')!;
      expect(img.getAttribute('sizes'), value).toContain(value);
    }
  });

  it('renders no srcset for a photo with a single candidate, since src already says it', () => {
    create({ photos: [PHOTOS[0]] });

    const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    expect(img.getAttribute('src')).toBe(PHOTOS[0]);
    expect(img.hasAttribute('srcset')).toBe(false);
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The photos with an `<img>` in the DOM, in slide order — the set the browser will fetch. */
  function mountedSrcs(): string[] {
    return [...el().querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
  }

  /** The one slide not faded out. */
  function shownSrc(): string | undefined {
    return (
      [...el().querySelectorAll('img')]
        .find((img) => !img.classList.contains('opacity-0'))
        ?.getAttribute('src') ?? undefined
    );
  }

  function click(testId: string): void {
    el().querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click();
    fixture.detectChanges();
  }

  /** jsdom never loads an image, so the slide's paint is the spec's to declare. */
  function finishLoading(src: string): void {
    [...el().querySelectorAll('img')]
      .find((img) => img.getAttribute('src') === src)
      ?.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  function pointer(
    type: string,
    x: number,
    y: number,
    id = 1,
    pointerType = 'touch',
    isPrimary = true,
  ): void {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    Object.defineProperty(event, 'pointerId', { value: id });
    Object.defineProperty(event, 'isPrimary', { value: isPrimary });
    el().dispatchEvent(event);
  }

  function swipe(dx: number, dy = 0, pointerType = 'touch'): void {
    pointer('pointerdown', 0, 0, 1, pointerType);
    pointer('pointerup', dx, dy, 1, pointerType);
    fixture.detectChanges();
  }

  function arrow(key: 'ArrowLeft' | 'ArrowRight'): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('renders the slide stack aria-hidden with prefixed test hooks and dots per photo', () => {
    create({ photos: PHOTOS, testId: 'map-banner', ownControls: true });

    const first = el().querySelector('[data-testid="map-banner-img"]')!;
    expect(first.getAttribute('src')).toBe(PHOTOS[0]);
    expect(first.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="map-banner-dots"] button').length).toBe(3);
  });

  it('backs the dots with the chrome rail and edges the step chips, so both survive any photo (#704)', () => {
    create({ photos: PHOTOS, testId: 'map-banner', ownControls: true });

    // The arithmetic picking their alphas is photo-slideshow.contrast.spec.ts; this pins that the markup wears them.
    const rail = el().querySelector('[data-testid="map-banner-dots"] > span')!;
    expect(rail.className).toContain('bg-riv-photo-chrome');
    for (const hook of ['map-banner-prev', 'map-banner-next']) {
      const chip = el().querySelector(`[data-testid="${hook}"] span`)!;
      expect(chip.className).toContain('border-riv-photo-chrome-edge');
    }
  });

  it('renders nothing for an empty photo list', () => {
    create({ photos: [] });
    expect(el().querySelector('img')).toBeNull();
    expect(el().querySelector('button')).toBeNull();
  });

  it('renders no controls or dots for a single photo, even with ownControls', () => {
    create({ photos: [PHOTOS[0]], ownControls: true });
    expect(el().querySelector('[data-testid="photo-img"]')).not.toBeNull();
    expect(el().querySelector('button')).toBeNull();
    expect(el().querySelector('[data-testid="photo-dots"]')).toBeNull();
  });

  it('keeps the dots inert and hidden without ownControls (the inside-a-link placement)', () => {
    create({ photos: PHOTOS });

    // A picker here would be a control nested inside the Discover card's <a>.
    expect(el().querySelector('button')).toBeNull();
    const dots = el().querySelector('[data-testid="photo-dots"]')!;
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.querySelectorAll('span').length).toBe(3);
  });

  it('steps with wrap in both directions via its own labelled controls (outside the aria-hidden layer)', () => {
    create({ photos: PHOTOS, ownControls: true, name: 'Miramar Beach Club' });

    const next = el().querySelector<HTMLButtonElement>('[data-testid="photo-next"]')!;
    expect(next.getAttribute('aria-label')).toBe('Next photo, Miramar Beach Club');
    expect(next.closest('[aria-hidden="true"]')).toBeNull();
    expect(shownSrc()).toBe(PHOTOS[0]);

    click('photo-next');
    expect(shownSrc()).toBe(PHOTOS[1]);

    // Back past the first photo wraps to the last; forward past the last wraps home.
    click('photo-prev');
    click('photo-prev');
    expect(shownSrc()).toBe(PHOTOS[2]);
    click('photo-next');
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('mounts only the starting slide, then each slide as it is reached', () => {
    create({ photos: PHOTOS, ownControls: true });

    // An opacity-0 slide still intersects the viewport, so an unmounted one is the only unfetched one.
    expect(mountedSrcs()).toEqual([PHOTOS[0]]);

    click('photo-next');
    expect(mountedSrcs()).toEqual([PHOTOS[0], PHOTOS[1]]);

    // Already-visited slides stay mounted, so stepping back never re-fetches.
    click('photo-prev');
    expect(mountedSrcs()).toEqual([PHOTOS[0], PHOTOS[1]]);
  });

  it('warms the neighbours only once the tourist has stepped, and the current slide has painted', () => {
    create({ photos: PHOTOS, ownControls: true });

    // An untouched slideshow — a Discover card nobody has swiped — never pays for a second image.
    finishLoading(PHOTOS[0]);
    expect(mountedSrcs()).toEqual([PHOTOS[0]]);

    click('photo-next');
    finishLoading(PHOTOS[1]);
    expect(mountedSrcs()).toEqual(PHOTOS);
  });

  it('resets to the first slide when the photos genuinely change (a surviving host reloads)', () => {
    create({ photos: PHOTOS, ownControls: true });
    click('photo-next');
    click('photo-next');
    expect(shownSrc()).toBe(PHOTOS[2]);

    // The list shrinks under the same instance (e.g. photos deleted, date change re-fetches).
    fixture.componentRef.setInput('photos', photoViews([PHOTOS[0]]));
    fixture.detectChanges();
    const only = el().querySelector<HTMLImageElement>('[data-testid="photo-img"]')!;
    expect(only.classList.contains('opacity-0')).toBe(false);
  });

  it('holds its place when a fresh array carries the same photos (the Discover re-derivation)', () => {
    create({ photos: PHOTOS, ownControls: true });
    click('photo-next');
    expect(shownSrc()).toBe(PHOTOS[1]);

    // pages/home rebuilds every card view inside a computed(), handing over a new array each time.
    fixture.componentRef.setInput('photos', photoViews([...PHOTOS]));
    fixture.detectChanges();
    expect(shownSrc()).toBe(PHOTOS[1]);
  });

  it('opens on startIndex instead of the first slide (the lightbox seeding case)', () => {
    create({ photos: PHOTOS, startIndex: 2 });
    expect(mountedSrcs()).toEqual([PHOTOS[2]]);
    expect(shownSrc()).toBe(PHOTOS[2]);
  });

  it('crops by default and letterboxes instead when contain is set', () => {
    create({ photos: PHOTOS });
    const cropped = el().querySelector<HTMLImageElement>('[data-testid="photo-img"]')!;
    expect(cropped.classList.contains('object-cover')).toBe(true);
    expect(cropped.classList.contains('object-contain')).toBe(false);

    create({ photos: PHOTOS, contain: true });
    const letterboxed = el().querySelector<HTMLImageElement>('[data-testid="photo-img"]')!;
    expect(letterboxed.classList.contains('object-contain')).toBe(true);
    expect(letterboxed.classList.contains('object-cover')).toBe(false);
  });

  it('marks only the first slide as the LCP image, and only when the host asks', () => {
    create({ photos: PHOTOS, ownControls: true });
    expect(el().querySelector('[data-testid="photo-img"]')!.getAttribute('fetchpriority')).toBe(
      'auto',
    );

    create({ photos: PHOTOS, ownControls: true, priority: true });
    expect(el().querySelector('[data-testid="photo-img"]')!.getAttribute('fetchpriority')).toBe(
      'high',
    );

    // The later slides are never the LCP element, whatever the host asked for.
    click('photo-next');
    const second = el().querySelector('[data-testid="photo-slide-img"]')!;
    expect(second.getAttribute('fetchpriority')).toBe('auto');
  });

  it('offers the dots as a labelled slide picker that jumps and marks the current photo', () => {
    create({ photos: PHOTOS, ownControls: true, name: 'Miramar Beach Club' });

    const third = el().querySelector<HTMLButtonElement>('[data-testid="photo-dot-2"]')!;
    expect(third.getAttribute('aria-label')).toBe('Photo 3 of 3, Miramar Beach Club');
    expect(el().querySelector('[data-testid="photo-dot-0"]')!.getAttribute('aria-current')).toBe(
      'true',
    );

    click('photo-dot-2');
    expect(shownSrc()).toBe(PHOTOS[2]);
    expect(third.getAttribute('aria-current')).toBe('true');
    expect(el().querySelector('[data-testid="photo-dot-0"]')!.getAttribute('aria-current')).toBe(
      null,
    );
  });

  it('steps on the arrow keys and keeps the arrow off the page behind it', () => {
    create({ photos: PHOTOS, ownControls: true });

    expect(arrow('ArrowRight').defaultPrevented).toBe(true);
    expect(shownSrc()).toBe(PHOTOS[1]);

    arrow('ArrowLeft');
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('leaves the arrow keys to the page when there is nothing to step through', () => {
    create({ photos: [PHOTOS[0]], ownControls: true });
    expect(arrow('ArrowRight').defaultPrevented).toBe(false);
  });

  it('announces the position in a live region that outlives the transition it announces', () => {
    create({ photos: PHOTOS, ownControls: true });

    const region = el().querySelector('[data-testid="photo-position"]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.classList.contains('sr-only')).toBe(true);
    expect(region.textContent?.trim()).toBe('Photo 1 of 3');

    click('photo-next');
    // The same element, still: a region replaced wholesale reads as silence.
    expect(el().querySelector('[data-testid="photo-position"]')).toBe(region);
    expect(region.textContent?.trim()).toBe('Photo 2 of 3');
  });

  it('exposes the position sentence for hosts that must mount the region themselves', () => {
    create({ photos: PHOTOS });
    expect(fixture.componentInstance.positionLabel()).toBe('Photo 1 of 3');

    fixture.componentInstance.next();
    fixture.detectChanges();
    expect(fixture.componentInstance.positionLabel()).toBe('Photo 2 of 3');

    // Nothing to announce when there is nothing to step.
    create({ photos: [PHOTOS[0]] });
    expect(fixture.componentInstance.positionLabel()).toBe('');
  });

  it('steps on a horizontal touch swipe, in the direction the finger travelled', () => {
    create({ photos: PHOTOS });

    swipe(-60);
    expect(shownSrc()).toBe(PHOTOS[1]);

    swipe(60);
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('ignores a short drag, a mostly-vertical drag, and a mouse drag', () => {
    create({ photos: PHOTOS });

    swipe(-30); // under the threshold — a shaky tap, not a flick
    swipe(-60, 90); // the tourist scrolling the page past the band
    swipe(-60, 0, 'mouse'); // on Discover the band IS the card's link
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('drops the gesture when a second finger lands, rather than measuring between two of them', () => {
    create({ photos: PHOTOS });

    // Finger A never travels; only B's overwritten origin could make its release look like a swipe.
    pointer('pointerdown', 0, 0, 1);
    pointer('pointerdown', 300, 0, 2, 'touch', false);
    pointer('pointerup', 0, 0, 1);
    pointer('pointerup', 400, 0, 2, 'touch', false);
    fixture.detectChanges();
    expect(shownSrc()).toBe(PHOTOS[0]);

    // And the band still takes the next single-finger swipe normally.
    swipe(-60);
    expect(shownSrc()).toBe(PHOTOS[1]);
  });

  it('takes the next swipe even when the previous gesture never got its pointerup', () => {
    create({ photos: PHOTOS });

    // Some mobile browsers drop a pointerup with no pointercancel; the stale slot must not bite.
    pointer('pointerdown', 0, 0, 1);
    swipe(-60);
    expect(shownSrc()).toBe(PHOTOS[1]);
  });

  it('ignores a release from a pointer it never tracked', () => {
    create({ photos: PHOTOS });
    pointer('pointerdown', 0, 0, 1);
    pointer('pointerup', -300, 0, 7);
    fixture.detectChanges();
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('keeps an arrow press to itself, so a host listening on an ancestor cannot step it twice', () => {
    create({ photos: PHOTOS, ownControls: true });

    // PhotoLightbox binds the same keys on the dialog to catch focus that never reaches us.
    const seenByAncestor = vi.fn();
    el().parentElement!.addEventListener('keydown', seenByAncestor);

    el()
      .querySelector('[data-testid="photo-dot-0"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(shownSrc()).toBe(PHOTOS[1]);
    expect(seenByAncestor).not.toHaveBeenCalled();
  });

  it('swallows the click a completed swipe synthesises, so the card link is not followed', () => {
    create({ photos: PHOTOS });

    swipe(-60);
    const after = new MouseEvent('click', { bubbles: true, cancelable: true });
    el().dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);

    // Only that one click: the next real tap must still reach the card.
    const later = new MouseEvent('click', { bubbles: true, cancelable: true });
    el().dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
