import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storeSource = readFileSync(
  resolve(
    import.meta.dirname,
    '../../src/lib/features/commons/stores/visualization.store.svelte.ts'
  ),
  'utf8'
);

const mapStateSource = readFileSync(
  resolve(
    import.meta.dirname,
    '../../src/lib/features/map/hooks/use-map-state.svelte.ts'
  ),
  'utf8'
);

const layerFactorySource = readFileSync(
  resolve(
    import.meta.dirname,
    '../../src/lib/features/map/layers/layer-factory.ts'
  ),
  'utf8'
);

describe('facet × commonScale — architecture invariant', () => {
  it('SymbolPrimitiveConfig exposes commonScale/positionMode/breakValueA/B', () => {
    expect(storeSource).toContain('commonScale?: boolean;');
    expect(storeSource).toContain('positionMode?: SymbolDoublePosition;');
    expect(storeSource).toContain('breakValueA?: number | null;');
    expect(storeSource).toContain('breakValueB?: number | null;');
  });

  it('buildSymbolPrimitiveConfig fills defaults to ensure cross-facet consistency', () => {
    expect(storeSource).toContain('commonScale: existing?.commonScale ?? true');
    expect(storeSource).toContain(
      'positionMode: existing?.positionMode ?? SymbolDoublePosition.OVERLAY'
    );
    expect(storeSource).toContain('breakValueA: existing?.breakValueA ?? null');
    expect(storeSource).toContain('breakValueB: existing?.breakValueB ?? null');
  });

  it('layer-factory shares the A+B max when commonScale is true', () => {
    expect(layerFactorySource).toContain(
      'Math.max(primaryDomainMax, secondaryDomainMax)'
    );
    expect(layerFactorySource).toContain('commonScale ? sharedMax');
  });

  it('statistics come from the dataset (not per-facet filtered) — global by design', () => {
    expect(mapStateSource).toContain(
      'datasetsStore.getColumnStatistics(viz.datasetId, columnName)'
    );
  });

  it('updateTriggers carry commonScale, positionMode, breakValueA/B', () => {
    const block = layerFactorySource
      .split('updateTriggers: {')[1]
      ?.split('}')[0];
    expect(block).toContain('breakValueA');
    expect(block).toContain('breakValueB');
    expect(block).toContain('commonScale');
    expect(block).toContain('positionMode');
  });
});
