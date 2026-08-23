import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

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
    fixture.componentRef.setInput('photos', inputs.photos);
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

  it('renders as a labelled, modal dialog seeded at the tapped photo', () => {
    create({ photos: PHOTOS, startIndex: 1, name: 'Miramar Beach Club' });

    expect(el().getAttribute('role')).toBe('dialog');
    expect(el().getAttribute('aria-modal')).toBe('true');
    expect(el().getAttribute('aria-label')).toBe('Photos of Miramar Beach Club');

    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="lightbox-img"], [data-testid="lightbox-slide-img"]',
    );
    expect(slides[1].classList.contains('opacity-0')).toBe(false);
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
