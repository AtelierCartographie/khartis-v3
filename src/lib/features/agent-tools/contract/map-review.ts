import type { ColumnNature } from './types';

/**
 * Checks Khartis computes before an export, for the agent to explain. They
 * restate cartographic rules the engine already follows; none needs a data
 * value.
 */

export interface ReviewClassesInput {
  classes: number;
  counts: number[];
  paletteFamily: 'sequential' | 'diverging' | null;
  colorblindSafePalette: boolean;
  hasBreakpoint: boolean;
}

export interface ReviewVisualizationInput {
  id: string;
  datasetId?: string;
  /** False when every primitive has a constant style. */
  dataDriven: boolean;
  fill?: {
    column?: string;
    nature?: ColumnNature;
    missingCount: number | null;
    missingShown: boolean;
    classes?: ReviewClassesInput;
  };
  proportionalSymbols?: { column?: string; nature?: ColumnNature };
  legends: { visible: boolean; title: string }[];
}

export interface MapReviewInput {
  pageTitle: string | null;
  pageSource: string | null;
  freeTexts: string[];
  visualizations: ReviewVisualizationInput[];
}

export interface MapReviewCheck {
  id: string;
  severity: 'warning' | 'advice';
  visualization_id?: string;
  message: string;
}

const MAX_READABLE_CLASSES = 7;
const SOURCE_WORD = /\bsources?\b/i;

function reviewPage(input: MapReviewInput): MapReviewCheck[] {
  const checks: MapReviewCheck[] = [];
  if (input.pageTitle === null) {
    checks.push(
      input.freeTexts.length === 0
        ? {
            id: 'title_missing',
            severity: 'warning',
            message: 'The page has no title.'
          }
        : {
            id: 'title_in_free_text',
            severity: 'advice',
            message:
              'The title field is empty: check that one of the free texts is the title.'
          }
    );
  }
  if (
    input.pageSource === null &&
    !input.freeTexts.some((text) => SOURCE_WORD.test(text))
  ) {
    checks.push({
      id: 'source_missing',
      severity: 'warning',
      message:
        'The page cites no source: a thematic map says where its data come from.'
    });
  }
  return checks;
}

function reviewClasses(
  id: string,
  classes: ReviewClassesInput
): MapReviewCheck[] {
  const checks: MapReviewCheck[] = [];
  const emptyClasses = classes.counts.filter((count) => count === 0).length;
  if (emptyClasses > 0) {
    checks.push({
      id: 'empty_classes',
      severity: 'warning',
      visualization_id: id,
      message: `${emptyClasses} of ${classes.classes} classes are empty: use fewer classes or another method.`
    });
  }
  if (classes.classes > MAX_READABLE_CLASSES) {
    checks.push({
      id: 'many_classes',
      severity: 'advice',
      visualization_id: id,
      message: `${classes.classes} classes are hard to tell apart on a map; ${MAX_READABLE_CLASSES} or fewer read better.`
    });
  }
  if (classes.paletteFamily === 'diverging' && !classes.hasBreakpoint) {
    checks.push({
      id: 'diverging_without_breakpoint',
      severity: 'advice',
      visualization_id: id,
      message:
        'A diverging palette suits values on both sides of a meaningful value, such as zero or an average: set that value as a breakpoint or use a sequential palette.'
    });
  }
  if (classes.paletteFamily === 'diverging' && !classes.colorblindSafePalette) {
    checks.push({
      id: 'palette_outside_colorblind_set',
      severity: 'advice',
      visualization_id: id,
      message:
        'This diverging palette is not one of the colour-blind-safe palettes Khartis offers: check it with the visual impairment simulation of the Styling step, or pick a colour-blind-safe palette.'
    });
  }
  return checks;
}

function reviewVisualization(
  visualization: ReviewVisualizationInput,
  shownMissing: Set<string>
): MapReviewCheck[] {
  const { id, fill, proportionalSymbols, legends } = visualization;
  const checks: MapReviewCheck[] = [];

  if (fill?.classes && fill.nature === 'count') {
    checks.push({
      id: 'count_as_choropleth',
      severity: 'warning',
      visualization_id: id,
      message: `The choropleth shows ${fill.column ?? 'a column'}, a count: areas of different sizes make counts misleading in a choropleth. Use proportional symbols, or a ratio such as a rate or a density.`
    });
  }
  if (proportionalSymbols?.nature === 'ratio') {
    checks.push({
      id: 'ratio_as_proportional_symbols',
      severity: 'warning',
      visualization_id: id,
      message: `The proportional symbols show ${proportionalSymbols.column ?? 'a column'}, a ratio: symbol sizes add up quantities, so a ratio reads better as a choropleth.`
    });
  }
  if (
    fill &&
    (fill.missingCount ?? 0) > 0 &&
    !fill.missingShown &&
    !shownMissing.has(missingKey(visualization))
  ) {
    checks.push({
      id: 'missing_values_hidden',
      severity: 'warning',
      visualization_id: id,
      message: `${fill.missingCount} rows have no value and the map does not show missing values: show them so that an absence is not read as a value.`
    });
  }
  if (fill?.classes) {
    checks.push(...reviewClasses(id, fill.classes));
  }

  // A constant style is read from its swatch label, without a title.
  if (!visualization.dataDriven) return checks;
  if (legends.length > 0 && legends.every((legend) => !legend.visible)) {
    checks.push({
      id: 'legend_hidden',
      severity: 'warning',
      visualization_id: id,
      message: 'The legend of this visualization is hidden.'
    });
  }
  if (legends.some((legend) => legend.visible && legend.title.trim() === '')) {
    checks.push({
      id: 'legend_title_missing',
      severity: 'warning',
      visualization_id: id,
      message: 'A legend has no title: say what is mapped, and its unit.'
    });
  }
  return checks;
}

// Layers often split one variable: one draws the classes, another the
// missing values. An absence shown by any of them is shown on the map.
function missingKey(visualization: ReviewVisualizationInput): string {
  return `${visualization.datasetId ?? ''}|${visualization.fill?.column ?? ''}`;
}

export function reviewMap(input: MapReviewInput): {
  ready: boolean;
  checks: MapReviewCheck[];
} {
  const shownMissing = new Set(
    input.visualizations
      .filter((visualization) => visualization.fill?.missingShown)
      .map(missingKey)
  );
  const checks = [
    ...reviewPage(input),
    ...input.visualizations.flatMap((visualization) =>
      reviewVisualization(visualization, shownMissing)
    )
  ];
  return {
    ready: checks.every((check) => check.severity !== 'warning'),
    checks
  };
}
