// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { ShapeType } from '$lib/features/commons/constants/visualization.constants';
import { resolveLegendRowStyle } from './legend-segments.utils';

// Configurations saved by the app on two bundled examples, trimmed to the
// primitives: Brest schools (symbols by sector with one shape per category,
// labels colored by type) and poverty in Seine-Saint-Denis (polygons in
// classes, hollow proportional circles, labels in a single color).
const BREST_SCHOOLS = {
  id: '953f1082-cfbc-4905-bee1-5810089614df',
  datasetId: '6df25746-1292-4036-9674-f36a14cca7b9',
  name: 'Visualisation',
  enabled: true,
  type: 'proportional',
  modes: {
    symbol: 'unique',
    fill: 'unique',
    stroke: 'unique',
    proportionalType: 'uniques'
  },
  mapping: {
    categoryColumn: 'type',
    labelColumn: 'etablissement'
  },
  primitiveFilters: ['point', 'text'],
  style: { textOpacity: 1, labelOpacity: 0 },
  symbol: {
    enabled: true,
    mode: 'categories',
    shape: 'circle',
    size: 16,
    minSize: 2,
    maxSize: 6,
    barWidth: 6,
    sizeScale: 'sqrt',
    opacity: 0.8,
    fillMode: 'categories',
    fillColor: '#0086cc',
    strokeMode: 'unique',
    strokeColor: '#ffffff',
    strokeWidth: 4,
    strokeOpacity: 0.6,
    strokeDashed: false,
    proportionalType: 'uniques',
    categoryShape: 'different',
    commonScale: true,
    knockout: true,
    positionMode: 'overlay',
    breakValueA: null,
    breakValueB: null,
    categoryColumn: 'secteur',
    sizeColumn: 'code_commune',
    fillCategoryColumn: 'etablissement',
    classification: {
      method: 'kmeans',
      classes: 4,
      colors: ['#37bbff', '#df6400'],
      inverted: false,
      labels: ['Privé', 'Public'],
      disabledLabels: [],
      categoryValues: ['Privé', 'Public']
    },
    strokeClassification: {
      method: 'kmeans',
      classes: 4,
      inverted: false
    }
  },
  text: {
    enabled: true,
    labelColumn: 'etablissement',
    colorMode: 'categories',
    sizeMode: 'fixed',
    fontFamily: 'Open Sans',
    color: '#000000',
    opacity: 1,
    size: 9,
    bold: false,
    italic: false,
    align: 'center',
    halo: false,
    haloColor: '#ffffff',
    haloWidth: 2,
    haloOpacity: 1,
    collisionDetection: true,
    automaticPlacement: false,
    labelColumns: false,
    filteredLabelsOptional: false,
    dxpMasking: false,
    categoryColumn: 'type',
    classification: {
      colors: ['#37bbff', '#df6400', '#df6cd0'],
      inverted: false,
      labels: ['Collège', 'Lycée', 'École']
    }
  },
  polygon: {
    enabled: false,
    fillMode: 'unique',
    fillColor: '#0086cc',
    fillOpacity: 0.6,
    strokeMode: 'none',
    strokeColor: '#595959',
    strokeWidth: 2,
    strokeOpacity: 1,
    strokeDashed: false,
    categoryColumn: 'etablissement'
  },
  line: {
    enabled: false,
    colorMode: 'unique',
    thicknessMode: 'unique',
    color: '#0086cc',
    width: 1,
    maxWidth: 5,
    opacity: 1,
    dashed: false,
    dashedPattern: 'dots',
    categoryColumn: 'etablissement',
    sizeColumn: 'code_commune'
  },
  symbolClassification: {
    method: 'kmeans',
    classes: 4,
    colors: ['#37bbff', '#df6400'],
    inverted: false,
    labels: ['Privé', 'Public'],
    disabledLabels: [],
    categoryValues: ['Privé', 'Public']
  },
  textClassification: {
    method: 'kmeans',
    classes: 4,
    colors: ['#37bbff', '#df6400', '#df6cd0'],
    inverted: false,
    labels: ['Collège', 'Lycée', 'École']
  }
} as unknown as VisualizationConfig;

const POVERTY_93 = {
  id: 'd7985e0e-0dc7-4bda-91ef-1cdb292576f2',
  datasetId: '7d26294d-a6f7-43a9-aba1-dd5e0e511a2c',
  name: 'Visualisation',
  enabled: true,
  type: 'proportional',
  modes: {
    symbol: 'proportional',
    fill: 'unique',
    stroke: 'unique',
    proportionalType: 'uniques'
  },
  mapping: {
    valueColumn: 'taux_pauvrete_pct',
    sizeColumn: 'personnes_pauvres',
    labelColumn: 'nom_commune'
  },
  primitiveFilters: ['point', 'polygon', 'text'],
  style: {},
  symbol: {
    enabled: true,
    mode: 'proportional',
    shape: 'circle',
    size: 12,
    minSize: 5.454545454545454,
    maxSize: 30,
    barWidth: 6,
    sizeScale: 'sqrt',
    opacity: 1,
    fillMode: 'none',
    fillColor: '#0086cc',
    fillColorB: '#ff832b',
    strokeMode: 'unique',
    strokeColor: '#000000',
    strokeWidth: 3,
    strokeOpacity: 1,
    strokeDashed: false,
    proportionalType: 'uniques',
    categoryShape: 'unique',
    commonScale: true,
    knockout: true,
    positionMode: 'overlay',
    breakValueA: null,
    breakValueB: null,
    valueColumn: 'population',
    sizeColumn: 'personnes_pauvres',
    classification: {
      method: 'kmeans',
      classes: 4,
      numClasses: 4
    }
  },
  text: {
    enabled: true,
    labelColumn: 'nom_commune',
    colorMode: 'unique',
    sizeMode: 'fixed',
    fontFamily: 'Open Sans',
    color: '#000000',
    opacity: 1,
    size: 9,
    bold: false,
    italic: false,
    align: 'center',
    halo: true,
    haloColor: '#ffffff',
    haloWidth: 2,
    haloOpacity: 0.8,
    collisionDetection: true,
    automaticPlacement: false,
    labelColumns: false,
    filteredLabelsOptional: false,
    dxpMasking: false,
    valueColumn: 'population',
    classification: {
      method: 'kmeans',
      classes: 4,
      numClasses: 4
    }
  },
  polygon: {
    enabled: true,
    fillMode: 'classes',
    fillColor: '#0086cc',
    fillOpacity: 1,
    strokeMode: 'none',
    strokeColor: '#ffffff',
    strokeWidth: 2,
    strokeOpacity: 1,
    strokeDashed: false,
    valueColumn: 'taux_pauvrete_pct',
    classification: {
      method: 'kmeans',
      classes: 4,
      numClasses: 4,
      colors: ['#ffd1bf', '#fb9f86', '#e26c4d', '#c63000'],
      breaks: [20, 28, 36],
      roundedMin: 9,
      roundedMax: 45,
      breakpointValue: null,
      inverted: false,
      paletteId: 'mono-vermilion',
      counts: [7, 13, 12, 7]
    }
  },
  line: {
    enabled: false,
    colorMode: 'unique',
    thicknessMode: 'unique',
    width: 1,
    maxWidth: 5,
    opacity: 1,
    dashed: false,
    dashedPattern: 'dots',
    valueColumn: 'population',
    sizeColumn: 'population'
  },
  classification: {
    method: 'kmeans',
    classes: 4,
    numClasses: 4,
    colors: ['#ffd1bf', '#fb9f86', '#e26c4d', '#c63000'],
    breaks: [20, 28, 36],
    roundedMin: 9,
    roundedMax: 45,
    breakpointValue: null,
    inverted: false,
    paletteId: 'mono-vermilion',
    counts: [7, 13, 12, 7]
  }
} as unknown as VisualizationConfig;

function row(values: Record<string, unknown>) {
  return (column: string) => (column in values ? values[column] : undefined);
}

describe('resolveLegendRowStyle', () => {
  it('should give a symbol its category color and shape when shapes differ by category', () => {
    expect(
      resolveLegendRowStyle(
        BREST_SCHOOLS,
        PrimitiveFilterType.POINT,
        'fill',
        row({ secteur: 'Public' })
      )
    ).toEqual({ color: '#df6400', shape: ShapeType.SQUARE });
    expect(
      resolveLegendRowStyle(
        BREST_SCHOOLS,
        PrimitiveFilterType.POINT,
        'fill',
        row({ secteur: 'Privé' })
      )
    ).toEqual({ color: '#37bbff', shape: ShapeType.CIRCLE });
  });

  it('should give a label its category color when text is colored by category', () => {
    expect(
      resolveLegendRowStyle(
        BREST_SCHOOLS,
        PrimitiveFilterType.TEXT,
        'fill',
        row({ type: 'École' })
      ).color
    ).toBe('#df6cd0');
  });

  it('should give a polygon the color of the class its value falls in', () => {
    const colorOf = (value: unknown) =>
      resolveLegendRowStyle(
        POVERTY_93,
        PrimitiveFilterType.POLYGON,
        'fill',
        row({ taux_pauvrete_pct: value })
      ).color;
    expect(colorOf(24.9)).toBe('#fb9f86');
    expect(colorOf(38.6)).toBe('#c63000');
    expect(colorOf(null)).toBeUndefined();
  });

  it('should leave a symbol drawn without fill uncolored and give its outline', () => {
    const readValue = row({ personnes_pauvres: 57_543 });
    expect(
      resolveLegendRowStyle(
        POVERTY_93,
        PrimitiveFilterType.POINT,
        'fill',
        readValue
      ).color
    ).toBeUndefined();
    expect(
      resolveLegendRowStyle(
        POVERTY_93,
        PrimitiveFilterType.POINT,
        'stroke',
        readValue
      ).color
    ).toBe('#000000');
  });
});
