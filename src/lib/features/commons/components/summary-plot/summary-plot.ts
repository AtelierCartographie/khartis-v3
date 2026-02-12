import * as m from '$lib/paraglide/messages';
import * as Plot from '@observablehq/plot';

interface HistogramBin {
  bin: number | null;
  count: number;
}

interface CategoryHistogramItem {
  category: string | null;
  count: number;
  percent: number;
}

interface ArrayWithToArrayMethod<T> {
  toArray(): T[];
  numRows: number;
}

export type NumericHistogram = ArrayWithToArrayMethod<HistogramBin>;
export type CategoricalHistogram =
  ArrayWithToArrayMethod<CategoryHistogramItem>;

interface SummaryPlotOptions {
  width?: number;
  height?: number;
  main_color?: string;
  nulls_color?: string;
  geoid?: boolean;
  unique_color?: string;
  stroke_main?: string;
  stroke_nulls?: string;
  stroke_unique?: string;
  bg_color?: string;
  text_color?: string;
  rule_color?: string;
}

interface NumericData {
  type_simple: 'numeric' | 'date';
  min: number | Date;
  max: number | Date;
  histogram: NumericHistogram;
  nulls?: number;
}

interface CategoricalData {
  type_simple: 'string';
  histogram: CategoricalHistogram;
  uniques?: number;
  nulls?: number;
  duplicates?: number;
}

export type SummaryPlotData = NumericData | CategoricalData;

type LabelFunction = (label: string | null) => string;
type PercentRange = [number, number];

interface ObservablePlotStackOptions {
  x?: string | ((d: unknown) => unknown);
  y?: string | ((d: unknown) => unknown);
  fill?: string | ((d: unknown) => string);
  stroke?: string | ((d: unknown) => string);
  text?: string | ((d: CategoryHistogramItem) => string | null);
  lineWidth?: number;
  textOverflow?:
    | 'clip'
    | 'ellipsis'
    | 'clip-start'
    | 'clip-end'
    | 'ellipsis-start'
    | 'ellipsis-middle'
    | 'ellipsis-end'
    | null;
  inset?: number;
  frameAnchor?:
    | 'middle'
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'right'
    | 'bottom-right'
    | 'bottom'
    | 'bottom-left'
    | 'left';
  dy?: number;
  dx?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  strokeWidth?: number;
  fontVariant?: string;
}

/**
 * Creates a summary plot based on the type of data provided.
 */
export function create_summary_plot(
  data: SummaryPlotData,
  options: SummaryPlotOptions = {}
) {
  const { type_simple } = data;
  switch (type_simple) {
    case 'numeric':
    /* falls through */

    case 'date':
      return create_plot_numeric(data as NumericData, options);

    case 'string':
      return create_plot_categorical(data as CategoricalData, options);
  }
}

/**
 * Creates a numeric plot (histogram) from analysis of a column.
 * bins and counts, min and max values, and nulls are used to create the plot.
 */
function create_plot_numeric(
  data: NumericData,
  options: SummaryPlotOptions = {}
) {
  const {
    width = 150,
    height = 56,
    main_color = '#8a3ffc',
    nulls_color = '#ff832b',
    text_color = '#525252',
    bg_color = '#f4f4f4',
    rule_color = '#8d8d8d'
  } = options;
  const { min, max, histogram, type_simple, nulls } = data;

  const is_date = type_simple === 'date';

  const nullCount =
    nulls ?? histogram.toArray().find((d) => d.bin === null)?.count ?? 0;

  const text_options = {
    y: 0,
    dy: 8,
    fontVariant: 'tabular-nums',
    fill: text_color
  };

  return Plot.plot({
    width,
    height,
    marginBottom: 14,
    marginLeft: 2,
    marginRight: 2,
    style: { overflow: 'hidden', color: text_color },
    x: { axis: null, type: 'band' },
    y: { axis: null },
    marks: [
      Plot.rectY(histogram.toArray(), {
        x: 'bin',
        y: 'count',
        fill: (d) => (d.bin !== null ? main_color : nulls_color)
      }),
      Plot.ruleY([0], { stroke: rule_color }),
      Plot.text(
        [
          is_date
            ? (min as Date)?.toLocaleDateString()
            : (min as number)?.toLocaleString()
        ],
        {
          ...text_options,
          dx: -(width / 2),
          textAnchor: 'start'
        }
      ),
      Plot.text(
        [
          is_date
            ? (max as Date)?.toLocaleDateString()
            : (max as number)?.toLocaleString()
        ],
        {
          ...text_options,
          dx: width / 2,
          textAnchor: 'end'
        }
      ),
      nullCount > 0
        ? [
            Plot.rectY(
              histogram.toArray().filter((d) => d.bin === null),
              Plot.pointerX({
                x: 'bin',
                y: 'count',
                stroke: 'currentColor'
              })
            ),
            Plot.text(
              histogram.toArray().filter((d) => d.bin === null),
              Plot.pointerX({
                x: 'bin',
                y: 0,
                text: () => 'XXXXXXXXXXXXXXX',
                dy: 8,
                fill: bg_color,
                stroke: bg_color,
                strokeWidth: 5
              })
            ),
            Plot.text(
              histogram.toArray().filter((d) => d.bin === null),
              Plot.pointerX({
                x: 'bin',
                y: 0,
                text: () => `${nullCount.toLocaleString()} nulls`,
                dx: 8,
                dy: 8,
                fill: 'grey',
                textAnchor: 'end'
              })
            )
          ]
        : null
    ]
  });
}

/**
 * Creates a categorical plot using the provided data and options.
 */
function create_plot_categorical(
  data: CategoricalData,
  options: SummaryPlotOptions = {}
) {
  const {
    width = 150,
    height = 56,
    geoid = false,
    main_color = '#d02670',
    nulls_color = '#ff832b',
    unique_color = '#007d79',
    stroke_main = 'none',
    stroke_nulls = 'none',
    stroke_unique = 'none',
    bg_color = '#f4f4f4',
    text_color = '#525252'
  } = options;

  const { uniques, histogram } = data;
  let histogramArray = histogram.toArray();

  if (geoid) {
    const has_unique = histogramArray.find(
      (d: CategoryHistogramItem) => d.category === 'unique'
    );
    if (has_unique)
      histogramArray = [
        has_unique,
        ...histogramArray.filter(
          (d: CategoryHistogramItem) => d.category !== 'unique'
        )
      ];
  }

  const get_label: LabelFunction = (label) =>
    label === null ? 'nulls' : label;

  const label_layer = (filter: PercentRange, lineWidth: number) =>
    Plot.textX(
      histogramArray as CategoryHistogramItem[],
      Plot.stackX({
        text: (d: CategoryHistogramItem) =>
          d.percent >= filter[0] && d.percent < filter[1]
            ? get_label(d.category)
            : null,
        x: 'count',
        lineWidth,
        textOverflow: 'clip-end',
        fill: '#ffffff'
      } as ObservablePlotStackOptions)
    );

  const numRows = data.histogram.numRows;
  const inset: number | undefined =
    numRows > 30 ? undefined : numRows > 20 ? 0.2 : 0.5;

  const has_one_category = numRows === 1 ? true : false;

  function renameXYPxPy(
    options: Record<string, unknown>
  ): Record<string, unknown> {
    const { x, y, ...rest } = options;
    return { ...rest, px: x, py: y };
  }

  const plot = Plot.plot({
    width,
    height,
    marginLeft: 5,
    marginRight: 5,
    marginBottom: 14,
    marginTop: 4,
    style: 'overflow: hidden;',
    x: { axis: null },
    marks: [
      Plot.barX(
        histogramArray as CategoryHistogramItem[],
        Plot.stackX({
          x: 'count',
          fill: (d: CategoryHistogramItem) =>
            d.category === 'unique'
              ? unique_color
              : d.category === null
                ? nulls_color
                : main_color,
          stroke: (d: CategoryHistogramItem) =>
            d.category === 'unique'
              ? stroke_unique
              : d.category === null
                ? stroke_nulls
                : stroke_main,
          inset
        } as ObservablePlotStackOptions)
      ),

      has_one_category
        ? Plot.textX(
            histogramArray as CategoryHistogramItem[],
            Plot.stackX({
              text: (d: CategoryHistogramItem) =>
                d.category === 'unique'
                  ? m.summary_plot_unique_values({
                      count: d.count.toLocaleString()
                    })
                  : `${d.category}`,
              lineWidth: 12,
              x: 'count',
              textOverflow: 'clip-end',
              fill: '#ffffff'
            } as ObservablePlotStackOptions)
          )
        : null,
      !has_one_category ? label_layer([0.8, 1], 9) : null,
      label_layer([0.6, 0.8], 6),
      label_layer([0.4, 0.6], 5),
      label_layer([0.2, 0.4], 3),
      label_layer([0.15, 0.2], 2),
      label_layer([0.1, 0.15], 1),
      has_one_category
        ? null
        : Plot.text(
            [
              m.summary_plot_categories({
                count: (uniques ?? 0).toLocaleString()
              })
            ],
            {
              frameAnchor: 'bottom-left',
              dy: 10,
              fill: text_color
            }
          ),

      Plot.barX(
        histogramArray as CategoryHistogramItem[],
        Plot.pointerX(
          Plot.stackX({
            x: 'count',
            stroke: 'currentColor',
            inset
          } as ObservablePlotStackOptions)
        )
      ),
      Plot.text(
        histogramArray as CategoryHistogramItem[],
        Plot.pointerX(
          renameXYPxPy(
            Plot.stackX({
              x: 'count',
              text: (_d: CategoryHistogramItem) => 'XXXXXXXXXXXXXXXXXXX',
              frameAnchor: 'bottom-left',
              dy: 10,
              fill: bg_color,
              stroke: bg_color,
              strokeWidth: 5
            } as never)
          )
        )
      ),
      Plot.text(
        histogramArray as CategoryHistogramItem[],
        Plot.pointerX(
          renameXYPxPy(
            Plot.stackX({
              x: 'count',
              text: (d: CategoryHistogramItem) =>
                `${d.count?.toLocaleString()} - ${d.category}`,
              frameAnchor: 'bottom-left',
              dy: 10,
              fill: text_color
            } as never)
          )
        )
      )
    ]
  });

  return plot;
}
