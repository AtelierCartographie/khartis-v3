import { describe, expect, it } from 'vitest';

describe('resolveDiscretizationLabel', () => {
  it('can import the module without a runtime initialization error', async () => {
    const module = await import('./discretization.utils');
    const label = module.resolveDiscretizationLabel(undefined);

    expect(label).toContain('5 classes');
    expect(label.length).toBeGreaterThan('5 classes'.length);
  }, 10000);
});
