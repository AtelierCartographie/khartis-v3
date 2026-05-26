import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'polygon-mode-density.svelte'),
  'utf8'
);

describe('PolygonModeDensity', () => {
  it('routes color selection through SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).not.toContain('<ColorSelector');
  });

  it('keeps density color changes wired to the density-specific handler', () => {
    expect(source).toContain('onchange={handleFillColorChange}');
  });

  it('writes density settings through the dedicated callback instead of the store', () => {
    expect(source).toContain(
      'onDensityChange?: (updates: Partial<DensityConfig>) => void;'
    );
    expect(source).toContain('onDensityChange?.({ valueColumn: field.text');
    expect(source).toContain('onDensityChange?.({ valueColumn: undefined');
    expect(source).toContain('onDensityChange?.({ level, ratio: option.ratio');
    expect(source).toContain('onDensityChange?.({ dotSize: value })');
    expect(source).toContain('onDensityChange?.({ color: value })');
    expect(source).not.toContain('visualizationStore.updateVisualization');
  });

  it('computes density levels from GPS points when the dataset is joined to a basemap', () => {
    expect(source).toContain('computeDensityLevelsFromGpsJoin');
    expect(source).toContain('duckDataset?.gpsMode && duckDataset.gpsColumns');
  });

  it('selects the density variable through FacetsVariablePicker, not a plain Carbon Dropdown', () => {
    expect(source).toContain('<FacetsVariablePicker');
    expect(source).toContain(
      "import FacetsVariablePicker from '../shared/facets-variable-picker.svelte'"
    );
    expect(source).not.toContain('import { Dropdown }');
    expect(source).not.toContain('<Dropdown');
  });

  it('restricts the density variable list to numeric fields', () => {
    expect(source).toContain(
      "filterFieldsByKind(selectableDataFields, 'numeric', selectedColumnId)"
    );
    expect(source).toContain('singleSelectItems={selectableNumericFields}');
  });

  it('formats density equivalence labels without parenthesized ratios', () => {
    expect(source).toContain(
      'labelText: `${levelLabelFor(option.level)} : ${m.density_ratio_label({ ratio: String(option.ratio) })}`'
    );
    expect(source).not.toContain(
      'labelText: `${levelLabelFor(option.level)} (${m.density_ratio_label'
    );
  });
});
