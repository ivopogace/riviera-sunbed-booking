import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { StatTile } from './stat-tile';

@Component({
  imports: [StatTile],
  template: `
    <div class="grid grid-cols-2">
      <app-stat-tile label="Free today" valueTestId="t-value">
        2<span class="frac">/ 5</span>
      </app-stat-tile>
      <app-stat-tile
        label="Online takings"
        valueTestId="t-takings"
        [sub]="sub"
        subTestId="t-net"
      >
        €110
      </app-stat-tile>
    </div>
  `,
})
class Host {
  sub: string | undefined = '€93.50 after 15% commission';
}

function render(sub?: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.sub = sub;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StatTile', () => {
  it('renders the label and the projected value under the given test id', () => {
    const host = render();

    expect(host.querySelector('.riv-stat-label')!.textContent).toContain('Free today');
    expect(
      host.querySelector('[data-testid="t-value"]')!.textContent!.replace(/\s+/g, ' ').trim(),
    ).toBe('2/ 5');
  });

  it('omits the sub-caption element entirely when no sub is given', () => {
    const host = render();

    expect(host.querySelector('[data-testid="t-net"]')).toBeNull();
    expect(host.querySelectorAll('.riv-stat-sub')).toHaveLength(0);
  });

  it('renders the sub-caption under its own test id when one is given', () => {
    const host = render('€93.50 after 15% commission');

    expect(host.querySelector('[data-testid="t-net"]')!.textContent).toContain(
      '€93.50 after 15% commission',
    );
  });

  it('carries the card-glass surface on an article, not on the collapsed host', () => {
    const host = render();
    const tile = host.querySelector('.riv-stat')!;

    expect(tile.tagName).toBe('ARTICLE');
    expect(tile.className).toContain('bg-(--riv-card-glass)');
  });

  it('collapses its own host so the article is the strip grid item', () => {
    const host = render();

    expect(host.querySelector('app-stat-tile')!.className).toContain('contents');
  });
});
