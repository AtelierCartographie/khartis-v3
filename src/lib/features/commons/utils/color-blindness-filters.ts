import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

const COLOR_MATRIX: Record<string, string> = {
  [ColorBlindnessType.PROTANOPIA]:
    '0.567, 0.433, 0,     0, 0  ' +
    '0.558, 0.442, 0,     0, 0  ' +
    '0,     0.242, 0.758, 0, 0  ' +
    '0,     0,     0,     1, 0',
  [ColorBlindnessType.DEUTERANOPIA]:
    '0.625, 0.375, 0,   0, 0  ' +
    '0.7,   0.3,   0,   0, 0  ' +
    '0,     0.3,   0.7, 0, 0  ' +
    '0,     0,     0,   1, 0',
  [ColorBlindnessType.TRITANOPIA]:
    '0.95, 0.05,  0,     0, 0  ' +
    '0,    0.433, 0.567, 0, 0  ' +
    '0,    0.475, 0.525, 0, 0  ' +
    '0,    0,     0,     1, 0',
  [ColorBlindnessType.PROTANOMALY]:
    '0.817, 0.183, 0,     0, 0  ' +
    '0.333, 0.667, 0,     0, 0  ' +
    '0,     0.125, 0.875, 0, 0  ' +
    '0,     0,     0,     1, 0',
  [ColorBlindnessType.DEUTERANOMALY]:
    '0.8,   0.2,   0,     0, 0  ' +
    '0.258, 0.742, 0,     0, 0  ' +
    '0,     0.142, 0.858, 0, 0  ' +
    '0,     0,     0,     1, 0',
  [ColorBlindnessType.TRITANOMALY]:
    '0.967, 0.033, 0,     0, 0  ' +
    '0,     0.733, 0.267, 0, 0  ' +
    '0,     0.183, 0.817, 0, 0  ' +
    '0,     0,     0,     1, 0',
  [ColorBlindnessType.ACHROMATOPSIA]:
    '0.299, 0.587, 0.114, 0, 0  ' +
    '0.299, 0.587, 0.114, 0, 0  ' +
    '0.299, 0.587, 0.114, 0, 0  ' +
    '0,     0,     0,     1, 0',
  [ColorBlindnessType.ACHROMATOMALY]:
    '0.618, 0.320, 0.062, 0, 0  ' +
    '0.163, 0.775, 0.062, 0, 0  ' +
    '0.163, 0.320, 0.516, 0, 0  ' +
    '0,     0,     0,     1, 0'
};

const SVG_FILTER_ID = 'khartis-color-blindness-filter';

function createSVGFilterElement(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'khartis-svg-filters');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);

  return svg;
}

function ensureSVGFiltersExist(): SVGDefsElement {
  let svg = document.getElementById(
    'khartis-svg-filters'
  ) as unknown as SVGSVGElement | null;
  if (!svg) {
    svg = createSVGFilterElement();
    document.body.appendChild(svg);
  }
  return svg.querySelector('defs')!;
}

export function applyColorBlindnessFilter(
  element: HTMLElement,
  type: ColorBlindnessType
): void {
  if (type === ColorBlindnessType.NONE) {
    element.style.filter = '';
    removeFilter();
    return;
  }

  const matrix = COLOR_MATRIX[type];
  if (!matrix) {
    element.style.filter = '';
    return;
  }

  const defs = ensureSVGFiltersExist();

  const existing = document.getElementById(SVG_FILTER_ID);
  if (existing) {
    existing.remove();
  }

  const filter = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'filter'
  );
  filter.setAttribute('id', SVG_FILTER_ID);

  const feColorMatrix = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'feColorMatrix'
  );
  feColorMatrix.setAttribute('type', 'matrix');
  feColorMatrix.setAttribute('values', matrix);

  filter.appendChild(feColorMatrix);
  defs.appendChild(filter);

  element.style.filter = `url(#${SVG_FILTER_ID})`;
}

function removeFilter(): void {
  const existing = document.getElementById(SVG_FILTER_ID);
  if (existing) {
    existing.remove();
  }
}

export function getColorBlindnessFilterId(
  type: ColorBlindnessType
): string | null {
  if (type === ColorBlindnessType.NONE) {
    return null;
  }
  return SVG_FILTER_ID;
}
