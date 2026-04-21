import { beforeEach, describe, expect, it } from 'vitest';
import {
  createExclusiveContextualSurfaceId,
  engageExclusiveContextualSurface,
  getActiveExclusiveContextualSurfaceId,
  resetExclusiveContextualSurfaces
} from './contextual-surface-coordinator';

describe('contextual-surface-coordinator', () => {
  beforeEach(() => {
    resetExclusiveContextualSurfaces();
  });

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
    expect(getActiveExclusiveContextualSurfaceId()).toBe(secondId);

    releaseFirst();
    releaseSecond();
  });

  it('should clear the active surface when it is released', () => {
    const surfaceId = createExclusiveContextualSurfaceId('surface');
    const release = engageExclusiveContextualSurface(surfaceId, () => {});

    expect(getActiveExclusiveContextualSurfaceId()).toBe(surfaceId);

    release();

    expect(getActiveExclusiveContextualSurfaceId()).toBeNull();
  });
});
