import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormField, form, required } from '@angular/forms/signals';

import { expectNoAxeViolations } from '../../testing/axe';
import { StarRating } from './star-rating';

@Component({
  selector: 'app-star-rating-host',
  imports: [StarRating, FormField],
  template: `<app-star-rating label="Your rating" [formField]="ratingForm.stars" />`,
})
class StarRatingHost {
  readonly model = signal<{ stars: number | null }>({ stars: null });
  readonly ratingForm = form(this.model, (path) => {
    required(path.stars, { message: 'Pick a star rating.' });
  });
}

describe('StarRating', () => {
  let fixture: ComponentFixture<StarRatingHost>;
  let host: StarRatingHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StarRatingHost] }).compileComponents();
    fixture = TestBed.createComponent(StarRatingHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function group(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('[role="radiogroup"]')!;
  }

  function stars(): HTMLElement[] {
    return [...group().querySelectorAll<HTMLElement>('[role="radio"]')];
  }

  async function press(from: HTMLElement, key: string): Promise<void> {
    from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await fixture.whenStable();
  }

  async function click(index: number): Promise<void> {
    stars()[index].click();
    await fixture.whenStable();
  }

  it('renders five labelled radios inside a named radiogroup', () => {
    expect(group().getAttribute('aria-label')).toBe('Your rating');
    expect(stars()).toHaveLength(5);
    expect(stars().map((s) => s.getAttribute('aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ]);
  });

  it('starts with no star selected and the first radio as the only tab stop', () => {
    expect(stars().map((s) => s.getAttribute('aria-checked'))).toEqual(
      Array<string>(5).fill('false'),
    );
    expect(stars().map((s) => s.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('writes the form field when a star is clicked', async () => {
    await click(3);

    expect(host.model().stars).toBe(4);
    expect(host.ratingForm.stars().value()).toBe(4);
    expect(stars()[3].getAttribute('aria-checked')).toBe('true');
  });

  it('moves the roving tab stop to the checked star', async () => {
    await click(3);

    expect(stars().map((s) => s.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
  });

  it('satisfies the required validator once a star is picked', async () => {
    expect(host.ratingForm().valid()).toBe(false);

    await click(0);

    expect(host.ratingForm().valid()).toBe(true);
  });

  it('selects and focuses the next star on ArrowRight, wrapping at the end', async () => {
    await click(2);

    await press(stars()[2], 'ArrowRight');
    expect(host.model().stars).toBe(4);
    expect(document.activeElement).toBe(stars()[3]);

    await click(4);
    await press(stars()[4], 'ArrowRight');
    expect(host.model().stars).toBe(1);
    expect(document.activeElement).toBe(stars()[0]);
  });

  it('selects and focuses the previous star on ArrowLeft, wrapping at the start', async () => {
    await click(0);

    await press(stars()[0], 'ArrowLeft');

    expect(host.model().stars).toBe(5);
    expect(document.activeElement).toBe(stars()[4]);
  });

  it('jumps to the extremes with Home and End', async () => {
    await click(2);

    await press(stars()[2], 'End');
    expect(host.model().stars).toBe(5);

    await press(stars()[4], 'Home');
    expect(host.model().stars).toBe(1);
  });

  it('starts at the first star when nothing is selected yet', async () => {
    await press(stars()[0], 'ArrowRight');

    expect(host.model().stars).toBe(1);
  });

  it('leaves other keys to the browser', async () => {
    await click(2);

    await press(stars()[2], 'Tab');

    expect(host.model().stars).toBe(3);
  });

  it('conveys selection with a filled glyph, never colour alone', async () => {
    await click(2);

    const glyphs = stars().map((s) => s.querySelector('[aria-hidden="true"]')!.textContent.trim());
    expect(glyphs).toEqual(['★', '★', '★', '☆', '☆']);
  });

  it('has no axe violations', async () => {
    await click(3);

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
