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
