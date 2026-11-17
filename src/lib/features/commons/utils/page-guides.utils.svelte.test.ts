import { describe, expect, it } from 'vitest';
import { snapRectToPageGuides } from './page-guides.utils';

const page = {
  width: 800,
  height: 600,
  margins: { top: 20, right: 30, bottom: 40, left: 50 }
};

describe('snapRectToPageGuides', () => {
  it('should centre the element when it comes close to the page centre', () => {
    const snap = snapRectToPageGuides(
      { x: 347, y: 100, width: 100, height: 50 },
      page,
      6
    );

    expect(snap.x).toBe(350);
    expect(snap.guides.vertical).toEqual([400]);
  });

  it('should lay the element edge on the margin when it comes close to it', () => {
    const snap = snapRectToPageGuides(
      { x: 300, y: 513, width: 100, height: 50 },
      page,
      6
    );

    expect(snap.y).toBe(510);
    expect(snap.guides.horizontal).toEqual([560]);
  });

  it('should leave the element in place when no line is near', () => {
    const snap = snapRectToPageGuides(
      { x: 200, y: 200, width: 60, height: 60 },
      page,
      6
    );

    expect(snap).toEqual({
      x: 200,
      y: 200,
      guides: { vertical: [], horizontal: [] }
    });
  });
});
