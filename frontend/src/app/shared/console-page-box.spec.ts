import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  CONSOLE_PAGE_ROW,
  ConsolePageBox,
  ConsolePageColumn,
  ConsolePageRow,
} from './console-page-box';

@Component({
  imports: [ConsolePageRow, ConsolePageColumn, ConsolePageBox],
  template: `
    <div appConsolePageRow data-testid="row"></div>
    <section appConsolePageColumn data-testid="column"></section>
    <section appConsolePageBox data-testid="box"></section>
  `,
})
class Host {}

const EDGE = 'ml-[max(0px,calc((100%_-_1120px)/2_+_1.5rem))]';

describe('console page box', () => {
  function classes(testId: string): string[] {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)!;
    return [...el.classList];
  }

  it('centres a full-bleed row in the 1120px box', () => {
    expect(classes('row')).toEqual(CONSOLE_PAGE_ROW.split(' '));
    expect(CONSOLE_PAGE_ROW).toContain('max-w-[1120px]');
  });

  it('starts a column at the box content edge and leaves its width to the host', () => {
    expect(classes('column')).toEqual(['mr-auto', EDGE]);
  });

  it('spans the box content from that same edge', () => {
    expect(classes('box')).toEqual(
      expect.arrayContaining([EDGE, 'mr-auto', 'max-w-[calc(1120px_-_3rem)]']),
    );
  });
});
