import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { OperatorHome } from './operator-home';

describe('OperatorHome (#277)', () => {
  let fixture: ComponentFixture<OperatorHome>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let result: OwnedVenuesResult;
  let loads: number;

  async function render(
    owned: OwnedVenuesResult,
    queryParams: Record<string, string> = {},
  ): Promise<void> {
    result = owned;
    loads = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: OwnedVenues,
          useValue: {
            load: (): Promise<OwnedVenuesResult> => {
              loads++;
              return Promise.resolve(result);
            },
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(OperatorHome);
    await fixture.whenStable();
  }

  function el(testId: string): HTMLElement {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  it('forwards an operator with no venue to onboarding', async () => {
    await render({ status: 'loaded', venues: [] });
    expect(navigate).toHaveBeenCalledWith('/venue-admin');
  });

  it('forwards a single-venue operator straight into that console', async () => {
    await render({ status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] });
    expect(navigate).toHaveBeenCalledWith('/operator/12');
  });

  it('renders a picker with every venue name when several are owned', async () => {
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
    expect([...links].map((a) => a.getAttribute('href'))).toEqual(['/operator/12', '/operator/15']);
  });

  it('honors a returnUrl over the venue-count rule', async () => {
    await render(
      { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] },
      { returnUrl: '/operator/15/payouts' },
    );
    expect(navigate).toHaveBeenCalledWith('/operator/15/payouts');
  });

  it('offers a retry instead of forwarding to onboarding when the read fails', async () => {
    // R-12: "couldn't load" must never be mistaken for "owns nothing".
    await render({ status: 'error' });

    expect(navigate).not.toHaveBeenCalled();
    expect(el('operator-home-error')).not.toBeNull();

    result = { status: 'loaded', venues: [{ id: 12, name: 'Miramar', beach: 'Dhërmi' }] };
    el('operator-home-retry').click();
    await fixture.whenStable();

    expect(loads).toBe(2);
    expect(navigate).toHaveBeenCalledWith('/operator/12');
  });
});
