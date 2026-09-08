import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhotoStepButton } from './photo-step-button';

@Component({
  imports: [PhotoStepButton],
  template: `
    <app-photo-step-button
      [direction]="direction()"
      testId="card-photo-step"
      label="Next photo, Miramar Beach Club"
      (stepped)="steps = steps + 1"
    />
  `,
})
class Host {
  readonly direction = signal<'prev' | 'next'>('next');
  steps = 0;
}

describe('PhotoStepButton', () => {
  let fixture: ComponentFixture<Host>;

  function button(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="card-photo-step"]',
    )!;
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('carries the whole accessible name, since the chevron itself is hidden', () => {
    expect(button().getAttribute('aria-label')).toBe('Next photo, Miramar Beach Club');
    expect(button().querySelector('span')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('pins to the side it steps towards, wearing that side’s chevron', () => {
    expect(button().className).toContain('right-[6px]');
    expect(button().textContent?.trim()).toBe('›');

    fixture.componentInstance.direction.set('prev');
    fixture.detectChanges();
    expect(button().className).toContain('left-[6px]');
    expect(button().textContent?.trim()).toBe('‹');
  });

  it('declares the touch-target floor and stays clickable inside a pointer-events-none overlay', () => {
    // The Discover card parks its pair in such an overlay so the card link stays clickable between them.
    expect(button().className).toContain('min-h-11');
    expect(button().className).toContain('min-w-11');
    expect(button().className).toContain('pointer-events-auto');
  });

  it('emits on click rather than stepping anything itself', () => {
    button().click();
    button().click();
    expect(fixture.componentInstance.steps).toBe(2);
  });

  it('keeps the chip edge that marks the control boundary over any photo (#704)', () => {
    expect(button().querySelector('span')!.className).toContain('border-riv-photo-chrome-edge');
  });
});
