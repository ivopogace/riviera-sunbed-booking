import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaleWriteBanner } from './stale-write-banner';

/** Exercises the banner exactly as the tabs consume it: projected message, footer slot, testids. */
@Component({
  imports: [StaleWriteBanner],
  template: `
    <app-stale-write-banner
      data-testid="host-stale-banner"
      reloadTestId="host-stale-reload"
      [reloading]="reloading()"
      (reload)="reloads = reloads + 1"
    >
      The thing was changed somewhere else.
      <ng-container bannerFooter>
        @if (footer()) {
          <span data-testid="host-footer">Reload failed.</span>
        }
      </ng-container>
    </app-stale-write-banner>
  `,
})
class Host {
  readonly reloading = signal(false);
  readonly footer = signal(false);
  reloads = 0;
}

describe('StaleWriteBanner', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  const byId = (id: string): HTMLElement | null =>
    host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('renders an alert carrying the projected message and the per-surface testids', () => {
    const banner = byId('host-stale-banner');
    expect(banner).toBeTruthy();
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('The thing was changed somewhere else.');
    expect(byId('host-stale-reload')?.textContent).toContain('Reload latest');
  });

  it('emits reload on click; while reloading the button is disabled and relabelled', () => {
    byId('host-stale-reload')?.click();
    expect(fixture.componentInstance.reloads).toBe(1);

    fixture.componentInstance.reloading.set(true);
    fixture.detectChanges();
    const button = byId('host-stale-reload') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Reloading…');
  });

  it('projects the footer slot after the button (the layout tab’s reload-failed hint)', () => {
    expect(byId('host-footer')).toBeNull();
    fixture.componentInstance.footer.set(true);
    fixture.detectChanges();
    const footer = byId('host-footer');
    expect(footer).toBeTruthy();
    const button = byId('host-stale-reload');
    expect(button && footer ? button.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy();
  });
});
