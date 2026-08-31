import { ComponentFixture, TestBed } from '@angular/core/testing';

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
  }): void {
    fixture = TestBed.createComponent(PhotoSlideshow);
    fixture.componentRef.setInput('photos', inputs.photos);
    if (inputs.ownControls !== undefined) {
      fixture.componentRef.setInput('ownControls', inputs.ownControls);
    }
    if (inputs.testId !== undefined) {
      fixture.componentRef.setInput('testId', inputs.testId);
    }
    if (inputs.name !== undefined) {
      fixture.componentRef.setInput('name', inputs.name);
    }
    if (inputs.startIndex !== undefined) {
      fixture.componentRef.setInput('startIndex', inputs.startIndex);
    }
    if (inputs.contain !== undefined) {
      fixture.componentRef.setInput('contain', inputs.contain);
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the slide stack aria-hidden with prefixed test hooks and dots per photo', () => {
    create({ photos: PHOTOS, testId: 'map-banner' });

    const first = el().querySelector('[data-testid="map-banner-img"]')!;
    expect(first.getAttribute('src')).toBe(PHOTOS[0]);
    expect(first.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="map-banner-slide-img"]').length).toBe(2);
    expect(el().querySelectorAll('[data-testid="map-banner-dots"] span').length).toBe(3);
  });

  it('backs the dots with the chrome rail and edges the step chips, so both survive any photo (#704)', () => {
    create({ photos: PHOTOS, testId: 'map-banner', ownControls: true });

    // The arithmetic picking their alphas is photo-slideshow.contrast.spec.ts; this pins that the markup wears them.
    const dots = el().querySelector('[data-testid="map-banner-dots"]')!;
    expect(dots.className).toContain('bg-riv-photo-chrome');
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

  it('renders no built-in controls unless ownControls is set (the inside-a-link placement)', () => {
    create({ photos: PHOTOS });
    expect(el().querySelector('button')).toBeNull();
    expect(el().querySelector('[data-testid="photo-dots"]')).not.toBeNull();
  });

  it('steps with wrap in both directions via its own labelled controls (outside the aria-hidden layer)', () => {
    create({ photos: PHOTOS, ownControls: true, name: 'Miramar Beach Club' });

    const next = el().querySelector<HTMLButtonElement>('[data-testid="photo-next"]')!;
    const prev = el().querySelector<HTMLButtonElement>('[data-testid="photo-prev"]')!;
    expect(next.getAttribute('aria-label')).toBe('Next photo, Miramar Beach Club');
    expect(next.closest('[aria-hidden="true"]')).toBeNull();

    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="photo-img"], [data-testid="photo-slide-img"]',
    );
    expect(slides[0].classList.contains('opacity-0')).toBe(false);

    next.click();
    fixture.detectChanges();
    expect(slides[0].classList.contains('opacity-0')).toBe(true);
    expect(slides[1].classList.contains('opacity-0')).toBe(false);

    // Back past the first photo wraps to the last; forward past the last wraps home.
    prev.click();
    prev.click();
    fixture.detectChanges();
    expect(slides[2].classList.contains('opacity-0')).toBe(false);
    next.click();
    fixture.detectChanges();
    expect(slides[0].classList.contains('opacity-0')).toBe(false);
  });

  it('resets to the first slide when the photos input changes (a surviving host reloads)', () => {
    create({ photos: PHOTOS, ownControls: true });
    el().querySelector<HTMLButtonElement>('[data-testid="photo-next"]')!.click();
    el().querySelector<HTMLButtonElement>('[data-testid="photo-next"]')!.click();
    fixture.detectChanges();

    // The list shrinks under the same instance (e.g. photos deleted, date change re-fetches).
    fixture.componentRef.setInput('photos', [PHOTOS[0]]);
    fixture.detectChanges();
    const only = el().querySelector<HTMLImageElement>('[data-testid="photo-img"]')!;
    expect(only.classList.contains('opacity-0')).toBe(false);
  });

  it('opens on startIndex instead of the first slide (the lightbox seeding case)', () => {
    create({ photos: PHOTOS, startIndex: 2 });
    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="photo-img"], [data-testid="photo-slide-img"]',
    );
    expect(slides[2].classList.contains('opacity-0')).toBe(false);
    expect(slides[0].classList.contains('opacity-0')).toBe(true);
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

  it('steps via the public prev()/next() API (the external-controls placement)', () => {
    create({ photos: PHOTOS });

    fixture.componentInstance.next();
    fixture.detectChanges();
    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="photo-img"], [data-testid="photo-slide-img"]',
    );
    expect(slides[1].classList.contains('opacity-0')).toBe(false);

    fixture.componentInstance.prev();
    fixture.detectChanges();
    expect(slides[0].classList.contains('opacity-0')).toBe(false);
  });
});
