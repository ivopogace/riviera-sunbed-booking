import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutcomeCard } from './outcome-card';

@Component({
  selector: 'app-outcome-card-host',
  imports: [OutcomeCard],
  template: `
    <app-outcome-card [tone]="tone()" [heading]="heading()" testId="landed">
      You&rsquo;re signed in as a tourist.
      <button outcomeCta type="button" data-testid="landed-cta">Browse beaches</button>
    </app-outcome-card>
  `,
})
class OutcomeCardHost {
  readonly tone = signal<'success' | 'pending'>('success');
  readonly heading = signal('Welcome back.');
}

describe('OutcomeCard', () => {
  let fixture: ComponentFixture<OutcomeCardHost>;
  let host: OutcomeCardHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OutcomeCardHost] }).compileComponents();
    fixture = TestBed.createComponent(OutcomeCardHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function card(): HTMLElement {
    return fixture.nativeElement.querySelector('[data-testid="landed"]')!;
  }

  it('renders the heading, the projected body and the projected CTA', () => {
    expect(card().querySelector('h1')?.textContent?.trim()).toBe('Welcome back.');
    expect(card().textContent).toContain('You’re signed in as a tourist.');
    expect(card().querySelector('[data-testid="landed-cta"]')).not.toBeNull();
  });

  it('labels the region by its heading so the landed state is announced', () => {
    const headingId = card().querySelector('h1')!.id;
    expect(headingId).toBeTruthy();
    expect(card().getAttribute('aria-labelledby')).toBe(headingId);
  });

  it('hides the decorative tone glyph from assistive technology', () => {
    const glyph = card().querySelector('[data-riv-outcome-glyph]')!;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('swaps the glyph and its tint between the success and pending tones', async () => {
    const successGlyph = card().querySelector('[data-riv-outcome-glyph]')!;
    const successText = successGlyph.textContent?.trim();
    const successClasses = successGlyph.className;

    host.tone.set('pending');
    await fixture.whenStable();

    const pendingGlyph = card().querySelector('[data-riv-outcome-glyph]')!;
    expect(pendingGlyph.textContent?.trim()).not.toBe(successText);
    expect(pendingGlyph.className).not.toBe(successClasses);
  });

  it('sits on the shared card-glass surface', () => {
    // Reuses the AA-proven token set rather than a private translucent fill (R-8).
    expect(card().classList.contains('bg-(--riv-card-glass)')).toBe(true);
    expect(card().classList.contains('text-(--riv-card-ink)')).toBe(true);
  });
});
