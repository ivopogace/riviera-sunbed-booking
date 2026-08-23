import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PhotoGalleryGrid } from './photo-gallery-grid';

const PHOTOS = ['/api/venues/1/photos/aa01', '/api/venues/1/photos/cc03'];

describe('PhotoGalleryGrid', () => {
  let fixture: ComponentFixture<PhotoGalleryGrid>;

  function create(photos: readonly string[], name?: string): void {
    fixture = TestBed.createComponent(PhotoGalleryGrid);
    fixture.componentRef.setInput('photos', photos);
    if (name !== undefined) {
      fixture.componentRef.setInput('name', name);
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the hero and every supporting tile as a labelled button', () => {
    create(PHOTOS, 'Miramar Beach Club');

    const hero = el().querySelector<HTMLButtonElement>('[data-testid="gallery-photo-0"]')!;
    expect(hero.tagName).toBe('BUTTON');
    expect(hero.getAttribute('aria-label')).toBe('View photo 1 of 2 of Miramar Beach Club');
    expect(hero.querySelector('[data-testid="gallery-hero"]')).not.toBeNull();

    const tile = el().querySelector<HTMLButtonElement>('[data-testid="gallery-photo-1"]')!;
    expect(tile.getAttribute('aria-label')).toBe('View photo 2 of 2 of Miramar Beach Club');
  });

  it('emits the tapped tile’s index', () => {
    create(PHOTOS);
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);

    el().querySelector<HTMLButtonElement>('[data-testid="gallery-photo-1"]')!.click();

    expect(opened).toHaveBeenCalledWith(1);
  });

  it('drops the "of <name>" clause when no name is given', () => {
    create(PHOTOS);
    const hero = el().querySelector('[data-testid="gallery-photo-0"]')!;
    expect(hero.getAttribute('aria-label')).toBe('View photo 1 of 2');
  });
});
