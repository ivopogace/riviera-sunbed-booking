import { TestBed } from '@angular/core/testing';

import { iconContract } from '../../testing/icon-contract';
import { TriangleIcon } from './triangle-icon';

describe('TriangleIcon', () => {
  iconContract(TriangleIcon, 13);

  it('is a solid mark pointing up, so a call site turns it with a rotate class', () => {
    const fixture = TestBed.createComponent(TriangleIcon);
    fixture.detectChanges();
    const shape = (fixture.nativeElement as HTMLElement).querySelector('path')!;

    expect(shape.getAttribute('fill')).toBe('currentColor');
  });
});
