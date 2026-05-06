import { describe, expect, it } from 'vitest';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import { resolveProjectionForRender } from '$lib/features/map/utils/projection-priority.utils';

const catalogProjection = { id: 'catalog' } as unknown as ProjectionLike;
const userProjection = { id: 'user' } as unknown as ProjectionLike;

describe('projection priority', () => {
  it('lets manual projection choices override catalog render projections', () => {
    expect(
      resolveProjectionForRender(catalogProjection, userProjection, 'manual')
    ).toBe(userProjection);
  });

  it('keeps catalog render projections ahead of automatic suggestions', () => {
    expect(
      resolveProjectionForRender(catalogProjection, userProjection, 'auto')
    ).toBe(catalogProjection);
  });

  it('ignores automatic suggestions when no catalog projection exists', () => {
    expect(
      resolveProjectionForRender(undefined, userProjection, 'auto')
    ).toBeUndefined();
  });

  it('falls back to the catalog projection when manual overrides are blocked', () => {
    expect(
      resolveProjectionForRender(
        catalogProjection,
        userProjection,
        'manual',
        false
      )
    ).toBe(catalogProjection);
  });
});
