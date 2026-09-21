import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';

import { DiscoverSheet } from '../app/pages/home/discover-sheet';

/** The sheet gives up retaking its rest after 8 frames of its own; the rest is slack. */
const MAX_FRAMES = 12;

/**
 * Waits for the discover sheet in `fixture` to confirm its opening rest, before a spec drives it.
 *
 * The sheet takes that rest and then retakes it on the frames that follow, because a rest taken
 * at a layout that has not settled is carried elsewhere by the browser's own snapping. A tap that
 * lands inside that window is read as exactly that and undone: the sheet drops back to half and
 * the Map pill with it, a frame after the assertion that expected it — which is a spec racing its
 * own setup, not an accessibility or detent defect. `opened()` is the sheet's own word that the
 * window has closed, so a spec waits for that rather than for a duration.
 */
export async function whenSheetOpened(fixture: ComponentFixture<unknown>): Promise<void> {
  const found = fixture.debugElement.query(By.directive(DiscoverSheet));
  if (found === null) {
    throw new Error('whenSheetOpened: this fixture renders no DiscoverSheet (yet)');
  }
  const sheet = found.componentInstance as DiscoverSheet;
  const view = (fixture.nativeElement as HTMLElement).ownerDocument.defaultView as Window;

  for (let frame = 0; frame < MAX_FRAMES && !sheet.opened(); frame += 1) {
    await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
  }
  expect(sheet.opened(), `the sheet took no opening rest within ${MAX_FRAMES} frames`).toBe(true);

  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
