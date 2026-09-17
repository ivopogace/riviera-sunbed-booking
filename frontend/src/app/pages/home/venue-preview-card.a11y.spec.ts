import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../../testing/axe';
import { venueCard } from '../../../testing/venue-cards';
import { CrowdStack } from './pin-crowding';
import { VenueCard } from './venue-card';
import { VenuePreviewCard } from './venue-preview-card';

/**
 * Automated axe-core audit of the pin preview in the states the page cannot reach in one render: the
 * crowd stepper with its dots, the stepper past six members (the count), and a venue whose online
 * sales for today have closed. Colour contrast is proven deterministically in
 * `venue-preview-card.contrast.spec.ts` — axe cannot measure it under jsdom.
 */
const FOLIE = venueCard({ id: 12, name: 'Folie Marine', beach: 'Dhërmi' });
const FOLIE_STACK: CrowdStack = { index: 1, count: 3, place: 'Dhërmi', prevId: '11', nextId: '13' };

describe('VenuePreviewCard accessibility', () => {
  let fixture: ComponentFixture<VenuePreviewCard>;

  function render(card: VenueCard, stack: CrowdStack | null): HTMLElement {
    TestBed.configureTestingModule({
      imports: [VenuePreviewCard],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(VenuePreviewCard);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('date', '2026-07-01');
    fixture.componentRef.setInput('stack', stack);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with the crowd stepper and its dots', async () => {
    const host = render(FOLIE, FOLIE_STACK);

    expect(host.querySelector('[data-testid="preview-stack-dots"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no serious violations with the stepper counting past six venues', async () => {
    const host = render(FOLIE, { ...FOLIE_STACK, index: 2, count: 7 });

    expect(host.querySelector('[data-testid="preview-stack-count"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no serious violations with a sales-closed venue and no stepper', async () => {
    const host = render(venueCard({ id: 1, name: 'Miramar Beach Club', salesClosed: true }), null);

    expect(host.querySelector('[data-testid="preview-sales-closed"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});
