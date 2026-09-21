import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';

import { DiscoverSheet } from '../app/pages/home/discover-sheet';

/** The sheet gives up after 8 frames of its own, and a re-measure restarts that; hence slack. */
const MAX_FRAMES = 12;

/**
 * Waits until the discover sheet in `fixture` has stopped retaking its opening rest, before a spec
 * drives it.
 *
 * <p>Until it has, `DiscoverSheet.rest` reads a tap landing inside that window as the snapping it
 * exists to beat and undoes it a frame later, which reaches the spec as a Map pill missing from an
 * assertion that ran later still. `opened()` is the sheet's own word for the window being shut:
 * set on a confirmed rest and on a given-up one, neither of which leaves a retry pending.
 */
export async function whenSheetOpened(fixture: ComponentFixture<unknown>): Promise<void> {
  const found = fixture.debugElement.query(By.directive(DiscoverSheet));
  if (found === null) {
    throw new Error('whenSheetOpened: this fixture renders no DiscoverSheet (yet)');
  }
  const sheet = found.componentInstance as DiscoverSheet;
  const view = (fixture.nativeElement as HTMLElement).ownerDocument.defaultView!;

  for (let frame = 0; frame < MAX_FRAMES && !sheet.opened(); frame += 1) {
    await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
  }
  expect(
    sheet.opened(),
    `the sheet never stopped retaking its opening rest within ${MAX_FRAMES} frames`,
  ).toBe(true);
  await fixture.whenStable();
}
