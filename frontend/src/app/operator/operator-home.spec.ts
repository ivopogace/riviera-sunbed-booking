import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { OperatorHome } from './operator-home';

describe('OperatorHome (#277, create state #278)', () => {
  let fixture: ComponentFixture<OperatorHome>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let result: OwnedVenuesResult;
  let loads: number;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function render(
    owned: OwnedVenuesResult,
    queryParams: Record<string, string> = {},
    gate?: Promise<void>,
  ): Promise<void> {
    result = owned;
    loads = 0;
    const paramMap = convertToParamMap(queryParams);
    params = new BehaviorSubject(paramMap);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // The create card injects HTTP-backed services (OperatorAuth, VenueAdminService).
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: OwnedVenues,
          useValue: {
            load: async (): Promise<OwnedVenuesResult> => {
              loads++;
              if (gate) {
                await gate; // hold the read open so the opening state is observable, not raced past
              }
              return result;
            },
            reset: (): void => undefined,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: paramMap },
            queryParamMap: params.asObservable(),
          },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(OperatorHome);
    if (gate) {
      fixture.detectChanges();
    } else {
      await fixture.whenStable();
    }
  }

  function el(testId: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)!;
  }

  it('renders the create card inline for an operator with no venues (#278)', async () => {
    await render({ status: 'loaded', venues: [] });

    expect(navigate).not.toHaveBeenCalled();
    expect(el('venue-create-card')).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#operator-home-title')?.textContent,
    ).toContain('Create your venue');
  });

  it('?create=1 renders the create card instead of forwarding a venue owner (#278)', async () => {
    await render(
      { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] },
      { create: '1' },
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(el('venue-create-card')).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#operator-home-title')?.textContent,
    ).toContain('Add another venue');
  });

  it('forwards a single-venue operator straight into that console', async () => {
    await render({ status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] });
    expect(navigate).toHaveBeenCalledWith('/operator/12');
  });

  it('announces through one region that survives opening → picker (#1078)', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await render(
      {
        status: 'loaded',
        venues: [
          { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
          { id: 15, name: 'Sereno', beach: 'Jal' },
        ],
      },
      {},
      held,
    );

    const announcer = el('load-announcer');
    expect(announcer.textContent?.trim()).toBe('Opening your console…');
    // The visible copy is decoration; the announcer alone carries the words.
    expect(el('operator-home-loading').getAttribute('aria-hidden')).toBe('true');

    release();
    // Two settles: the gate resolves a hop before load() writes the loaded state.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(el('load-announcer')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Choose a venue.');
  });

  it('renders a picker with every venue name — and the Add-another-venue entry (#278)', async () => {
    await render({
      status: 'loaded',
      venues: [
        { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
        { id: 15, name: 'Sereno', beach: 'Jal' },
      ],
    });

    expect(navigate).not.toHaveBeenCalled();
    const picker = el('operator-home-picker');
    expect(picker.textContent).toContain('Miramar Beach Club');
    expect(picker.textContent).toContain('Sereno');
    expect(picker.textContent).toContain('Dhërmi');
    const links = picker.querySelectorAll<HTMLAnchorElement>('a[href]');
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '/operator/12',
      '/operator/15',
      '/operator?create=1',
    ]);
    expect(el('operator-home-add-venue').textContent).toContain('Add another venue');
  });

  it('re-anchors focus on the swapped-in title when the picker becomes the create state (WCAG 2.4.3)', async () => {
    await render({
      status: 'loaded',
      venues: [
        { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
        { id: 15, name: 'Sereno', beach: 'Jal' },
      ],
    });
    fixture.detectChanges();
    expect(el('operator-home-picker')).not.toBeNull();

    // The activated "Add another venue" link unmounts with the branch swap (param-only nav).
    params.next(convertToParamMap({ create: '1' }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el('venue-create-card')).not.toBeNull();
    expect(document.activeElement?.id).toBe('operator-home-title');
  });

  it('a safe returnUrl outranks even the create state (the landingRouteFor contract)', async () => {
    await render(
      { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] },
      { create: '1', returnUrl: '/operator/15/payouts' },
    );
    expect(navigate).toHaveBeenCalledWith('/operator/15/payouts');
  });

  it('honors a returnUrl over the venue-count rule', async () => {
    await render(
      { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] },
      { returnUrl: '/operator/15/payouts' },
    );
    expect(navigate).toHaveBeenCalledWith('/operator/15/payouts');
  });

  it('leaves the announcer silent when the read fails (#1078)', async () => {
    await render({ status: 'error' });

    // Silence is the safe exit: the announcer must never contradict the failure panel beside it.
    expect(el('operator-home-error')).not.toBeNull();
    expect(el('load-announcer').textContent?.trim()).toBe('');
  });

  it('leaves the announcer silent on the create card, which is not the picker (#1078)', async () => {
    await render(
      {
        status: 'loaded',
        venues: [
          { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
          { id: 15, name: 'Sereno', beach: 'Jal' },
        ],
      },
      { create: '1' },
    );

    // Two venues, but the create card is the branch rendering — announcing the picker would lie.
    expect(el('venue-create-card')).not.toBeNull();
    expect(el('load-announcer').textContent?.trim()).toBe('');
  });

  it('offers a retry instead of rendering the create zero state when the read fails', async () => {
    // "Couldn't load" must never be mistaken for "owns nothing".
    await render({ status: 'error' });

    expect(navigate).not.toHaveBeenCalled();
    expect(el('operator-home-error')).not.toBeNull();
    expect(el('venue-create-card')).toBeNull();

    result = { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] };
    el('operator-home-retry').click();
    await fixture.whenStable();

    expect(loads).toBe(2);
    expect(navigate).toHaveBeenCalledWith('/operator/12');
  });
});
