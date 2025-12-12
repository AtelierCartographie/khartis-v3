import {
  create_summary_plot,
  type CategoricalHistogram,
  type NumericHistogram,
  type SummaryPlotData
} from '$lib/features/commons/components/summary-plot/summary-plot';
import type { AnalysisResult } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../utils/logger';
import { getColumnTypeStyle } from './column-type-styles';

type HistogramLike = NumericHistogram | CategoricalHistogram;

function isHistogram(value: unknown): value is HistogramLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HistogramLike).toArray === 'function'
  );
}

function isNumericHistogram(value: unknown): value is NumericHistogram {
  if (!isHistogram(value)) return false;
  const sample = value.toArray()[0];
  return sample === undefined || 'bin' in sample;
}

function isCategoricalHistogram(value: unknown): value is CategoricalHistogram {
  if (!isHistogram(value)) return false;
  const sample = value.toArray()[0];
  return sample === undefined || 'category' in sample;
}

function getCSSVariable(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function getPlotOptions(typeSimple?: string) {
  const typeStyle = getColumnTypeStyle(typeSimple);
  return {
    width: 150,
    height: 48,
    main_color: typeStyle.color,
    nulls_color: '#ffd666',
    unique_color: getCSSVariable('--cds-ui-03', '#525252'),
    bg_color: getCSSVariable('--cds-ui-02', '#393939'),
    text_color: getCSSVariable('--cds-text-01', '#f4f4f4'),
    text_secondary_color: getCSSVariable('--cds-text-02', '#c6c6c6'),
    bar_text_color: '#000'
  };
}

type PlotElement = ReturnType<typeof create_summary_plot>;

export function getPlotForColumn(
  columnName: string,
  columnAnalysis: Map<string, AnalysisResult>
): PlotElement | null {
  const analysis = columnAnalysis.get(columnName);
  if (!analysis) {
    return null;
  }

  const histogramValue = analysis.histogram;
  const typeSimple = analysis.type_simple;

  const renderPlot = (summaryData: SummaryPlotData): PlotElement | null => {
    try {
      return create_summary_plot(summaryData, getPlotOptions(typeSimple));
    } catch (err) {
      logger.error('Error creating histogram', LogCategory.UI, err);
      return null;
    }
  };

  if (analysis.type_simple === 'string') {
    if (!isCategoricalHistogram(histogramValue)) {
      return null;
    }
    const summaryData: SummaryPlotData = {
      ...(analysis as SummaryPlotData & { type_simple: 'string' }),
      histogram: histogramValue
    };
    return renderPlot(summaryData);
  }

  if (analysis.type_simple === 'numeric' || analysis.type_simple === 'date') {
    if (!isNumericHistogram(histogramValue)) {
      return null;
    }
    const summaryData: SummaryPlotData = {
      ...(analysis as SummaryPlotData & {
        type_simple: 'numeric' | 'date';
      }),
      histogram: histogramValue
    };
    return renderPlot(summaryData);
  }

  return null;
}
