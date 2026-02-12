import {
  create_summary_plot,
  type CategoricalHistogram,
  type NumericHistogram,
  type SummaryPlotData
} from '$lib/features/commons/components/summary-plot/summary-plot';
import type { AnalysisResult } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../utils/logger';

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

function getPlotOptions(typeSimple?: string) {
  const isString = typeSimple === 'string';

  return {
    width: 150,
    height: 36,
    main_color: isString ? '#d02670' : '#8a3ffc',
    nulls_color: '#ff832b',
    unique_color: '#007d79',
    bg_color: '#f4f4f4',
    text_color: '#525252',
    rule_color: '#8d8d8d'
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
