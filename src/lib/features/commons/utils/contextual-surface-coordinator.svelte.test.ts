import { describe, expect, it } from 'vitest';
import {
  createExclusiveContextualSurfaceId,
  engageExclusiveContextualSurface
} from './contextual-surface-coordinator';

describe('contextual-surface-coordinator', () => {
  it('should close the previous surface when a new one opens', () => {
    let firstClosed = 0;
    let secondClosed = 0;

    const releaseFirst = engageExclusiveContextualSurface(
      createExclusiveContextualSurfaceId('first'),
      () => {
        firstClosed += 1;
      }
    );

    const secondId = createExclusiveContextualSurfaceId('second');
    const releaseSecond = engageExclusiveContextualSurface(secondId, () => {
      secondClosed += 1;
    });

    expect(firstClosed).toBe(1);
    expect(secondClosed).toBe(0);

    releaseFirst();
    releaseSecond();
  });

  it('should unregister a released surface', () => {
    let firstClosed = 0;
    const releaseFirst = engageExclusiveContextualSurface(
      createExclusiveContextualSurfaceId('surface'),
      () => {
        firstClosed += 1;
      }
    );

    releaseFirst();

    const releaseSecond = engageExclusiveContextualSurface(
      createExclusiveContextualSurfaceId('second'),
      () => {}
    );

    expect(firstClosed).toBe(0);

    releaseSecond();
  });
});
