import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { FakeMapEngine } from './fake-map-engine';
import { MapEngine, MapHandle } from './map-engine';
import { RivieraMap } from './riviera-map';

class NoWebGlEngine extends MapEngine {
  override create(): Promise<MapHandle> {
    return Promise.reject(new Error('Failed to initialize WebGL'));
  }
}

/**
 * Structural axe audit of the map chrome in both states: the labelled zoom group, the skip
 * control and the attribution over a live map, and the unavailable message without one. Contrast
 * is proven in `riviera-map.contrast.spec.ts`; the real-browser audit with a rendered map is the
 * mocked e2e.
 */
describe('RivieraMap accessibility', () => {
  async function renderWith(engine: MapEngine): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RivieraMap],
      providers: [{ provide: MapEngine, useValue: engine }],
    });
    const fixture = TestBed.createComponent(RivieraMap);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with a live map', async () => {
    await expectNoAxeViolations(await renderWith(new FakeMapEngine()));
  });

  it('has no serious violations when the map is unavailable', async () => {
    await expectNoAxeViolations(await renderWith(new NoWebGlEngine()));
  });
});
