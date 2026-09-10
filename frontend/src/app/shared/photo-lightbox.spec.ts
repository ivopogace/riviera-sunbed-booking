import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { photoViews } from '../../testing/photo-views';

import { PhotoLightbox } from './photo-lightbox';

const PHOTOS = [
  '/api/venues/1/photos/aa01',
  '/api/venues/1/photos/cc03',
  '/api/venues/1/photos/dd04',
];

describe('PhotoLightbox', () => {
  let fixture: ComponentFixture<PhotoLightbox>;

  function create(inputs: { photos: readonly string[]; startIndex?: number; name?: string }): void {
    fixture = TestBed.createComponent(PhotoLightbox);
    fixture.componentRef.setInput('photos', photoViews(inputs.photos));
    if (inputs.startIndex !== undefined) {
      fixture.componentRef.setInput('startIndex', inputs.startIndex);
    }
    if (inputs.name !== undefined) {
      fixture.componentRef.setInput('name', inputs.name);
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The one slide not faded out. */
  function shownSrc(): string | undefined {
    return (
      [...el().querySelectorAll('img')]
        .find((img) => !img.classList.contains('opacity-0'))
        ?.getAttribute('src') ?? undefined
    );
  }

  it('renders as a labelled, modal dialog seeded at the tapped photo', () => {
    create({ photos: PHOTOS, startIndex: 1, name: 'Miramar Beach Club' });

    expect(el().getAttribute('role')).toBe('dialog');
    expect(el().getAttribute('aria-modal')).toBe('true');
    expect(el().getAttribute('aria-label')).toBe('Photos of Miramar Beach Club');

    // The slideshow mounts only the slide it opens on, so the seeded photo is the only <img> there.
    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="lightbox-img"], [data-testid="lightbox-slide-img"]',
    );
    expect(slides.length).toBe(1);
    expect(slides[0].getAttribute('src')).toBe(PHOTOS[1]);
    expect(slides[0].classList.contains('opacity-0')).toBe(false);
  });

  it('steps the photos on the arrow keys from anywhere in the dialog', () => {
    create({ photos: PHOTOS });

    // Focus opens on the close button, which is the slideshow's SIBLING — the dialog has to listen.
    const close = el().querySelector<HTMLElement>('[data-testid="lightbox-close"]')!;
    const right = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    close.dispatchEvent(right);
    fixture.detectChanges();

    expect(right.defaultPrevented).toBe(true);
    expect(shownSrc()).toBe(PHOTOS[1]);

    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(shownSrc()).toBe(PHOTOS[0]);
  });

  it('steps ONCE when the arrow is pressed on the slideshow’s own controls, not twice', () => {
    create({ photos: PHOTOS });

    // The dialog and the slideshow both listen; a dot button sits INSIDE the slideshow's subtree.
    const dot = el().querySelector<HTMLElement>('[data-testid="lightbox-dot-0"]')!;
    dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(shownSrc()).toBe(PHOTOS[1]);
  });

  it('letterboxes rather than crops, so a portrait photo shows whole (contain, not cover)', () => {
    create({ photos: PHOTOS });
    const first = el().querySelector<HTMLImageElement>('[data-testid="lightbox-img"]')!;
    expect(first.classList.contains('object-contain')).toBe(true);
    expect(first.classList.contains('object-cover')).toBe(false);
  });

  it('emits dismissed on Escape, on a backdrop click, and on the close button', () => {
    create({ photos: PHOTOS });
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);

    el().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissed).toHaveBeenCalledTimes(1);

    el().click();
    expect(dismissed).toHaveBeenCalledTimes(2);

    el().querySelector<HTMLButtonElement>('[data-testid="lightbox-close"]')!.click();
    expect(dismissed).toHaveBeenCalledTimes(3);
  });

  it('does not dismiss when the panel itself (not the backdrop) is clicked', () => {
    create({ photos: PHOTOS });
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);

    el().querySelector<HTMLElement>('[tabindex="-1"]')!.click();

    expect(dismissed).not.toHaveBeenCalled();
  });

  it('names the dialog generically with no venue name given', () => {
    create({ photos: PHOTOS });
    expect(el().getAttribute('aria-label')).toBe('Photos');
  });
});
