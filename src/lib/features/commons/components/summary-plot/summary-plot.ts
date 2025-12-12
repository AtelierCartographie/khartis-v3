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
    width = 144,
    height = 64,
    main_color = '#a56eff',
    nulls_color = 'gold',
    text_color = '#f4f4f4'
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
    marginBottom: nullCount > 0 ? 24 : 15,
    x: { axis: null, type: 'band' },
    y: { axis: null },
    marks: [
      Plot.rectY(histogram.toArray(), {
        x: 'bin',
        y: 'count',
        fill: (d) => (d.bin !== null ? main_color : nulls_color)
      }),
      Plot.ruleY([0], { stroke: text_color }),
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
        ? Plot.text([`${nullCount.toLocaleString()} nulls`], {
            frameAnchor: 'bottom',
            dy: 18,
            fill: nulls_color
          })
        : null
    ]
  });
}

/**
 * Extended category item with pre-calculated stacked positions
 */
interface StackedCategoryItem extends CategoryHistogramItem {
  x1: number;
  x2: number;
  xMid: number;
}

/**
 * Creates a categorical plot using the provided data and options.
 */
function create_plot_categorical(
  data: CategoricalData,
  options: SummaryPlotOptions = {}
) {
  const {
    width = 144,
    height = 64,
    geoid = false,
    main_color = '#fa4d56',
    nulls_color = 'gold',
    unique_color = 'grey',
    stroke_main = 'none',
    stroke_nulls = 'none',
    stroke_unique = 'none',
    bg_color = '#222',
    text_color = '#f4f4f4'
  } = options;

  const { uniques, histogram } = data;
  let histogramArray = histogram.toArray();

  // .toArray() to keep null at the end
  if (geoid) {
    const has_unique = histogramArray.find(
      (d: CategoryHistogramItem) => d.category === 'unique'
    );
    // If for geoid, category unique has to appear first
    if (has_unique)
      histogramArray = [
        has_unique,
        ...histogramArray.filter(
          (d: CategoryHistogramItem) => d.category !== 'unique'
        )
      ];
  }

  // Pre-calculate stacked positions for proper hover detection
  const totalCount = histogramArray.reduce((sum, d) => sum + d.count, 0);
  let cumulative = 0;
  const stackedData: StackedCategoryItem[] = histogramArray.map((d) => {
    const x1 = cumulative;
    cumulative += d.count;
    const x2 = cumulative;
    return {
      ...d,
      x1,
      x2,
      xMid: (x1 + x2) / 2
    };
  });

  const histogramData = stackedData;

  // Handle null category => show "nulls"
  const get_label: LabelFunction = (label) =>
    label === null ? 'nulls' : label;

  // filter : [low_limit, high limit]
  const label_layer = (filter: PercentRange, lineWidth: number) =>
    Plot.textX(
      histogramData as CategoryHistogramItem[],
      Plot.stackX({
        text: (d: CategoryHistogramItem) =>
          d.percent >= filter[0] && d.percent < filter[1]
            ? get_label(d.category)
            : null,
        x: 'count',
        lineWidth,
        textOverflow: 'clip-end'
      } as ObservablePlotStackOptions)
    );

  const numRows = data.histogram.numRows;
  // Adapt inset on number of categories. More categories = less inset.
  // Why? Whitout, rectangles are invisible with too much categories
  const inset: number | undefined =
    numRows > 30 ? undefined : numRows > 20 ? 0.2 : 0.5;

  // Intercept case when only one category.
  const has_one_category = numRows === 1 ? true : false;

  const plot = Plot.plot({
    width,
    height,
    marginLeft: 5,
    marginRight: 5,
    marginBottom: 15,
    marginTop: 10,
    style: 'overflow: visible;',
    x: { axis: null },
    marks: [
      // BARS
      Plot.barX(
        histogramData as CategoryHistogramItem[],
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

      // LABELS
      // special case all uniques values
      has_one_category
        ? Plot.textX(
            histogramData as CategoryHistogramItem[],
            Plot.stackX({
              text: (d: CategoryHistogramItem) =>
                d.category === 'unique'
                  ? `${d.count.toLocaleString()} valeurs uniques`
                  : `${d.category}`,
              lineWidth: 12,
              x: 'count',
              textOverflow: 'clip-end'
            } as ObservablePlotStackOptions)
          )
        : null,
      // adapt label length on percent values
      !has_one_category ? label_layer([0.8, 1], 9) : null,
      label_layer([0.6, 0.8], 6),
      label_layer([0.4, 0.6], 5),
      label_layer([0.2, 0.4], 3),
      label_layer([0.15, 0.2], 2),
      label_layer([0.1, 0.15], 1),
      has_one_category
        ? null
        : Plot.text([(uniques ?? 0).toLocaleString() + ' catégories'], {
            frameAnchor: 'bottom-left',
            dy: 10,
            fill: text_color
          }),

      // INTERACTIVITY
      // Highlight bar with fixed pointer-events
      Plot.barX(
        histogramData as CategoryHistogramItem[],
        Plot.pointerX(
          Plot.stackX({
            x: 'count',
            stroke: 'currentColor',
            inset,
            render: (
              index: number[],
              scales: unknown,
              values: unknown,
              dimensions: unknown,
              context: unknown,
              next: (
                i: number[],
                s: unknown,
                v: unknown,
                d: unknown,
                c: unknown
              ) => SVGGElement | null
            ) => {
              const g = next(index, scales, values, dimensions, context);
              if (g) {
                for (const rect of g.querySelectorAll('rect')) {
                  (rect as SVGElement).style.pointerEvents = 'all';
                }
              }
              return g;
            }
          } as ObservablePlotStackOptions & { render: unknown })
        )
      ),
      // Mask the count of all categories
      Plot.text(
        histogramData as StackedCategoryItem[],
        Plot.pointerX({
          px: 'xMid',
          text: (_d: StackedCategoryItem) => 'XXXXXXXXXXXXXXXXXXX',
          frameAnchor: 'bottom-left',
          dy: 10,
          fill: bg_color,
          stroke: bg_color,
          strokeWidth: 5
        } as never)
      ),
      // Show count and category in a fixed place
      Plot.text(
        histogramData as StackedCategoryItem[],
        Plot.pointerX({
          px: 'xMid',
          text: (d: StackedCategoryItem) =>
            `${d.count.toLocaleString()} - ${d.category}`,
          frameAnchor: 'bottom-left',
          dy: 10,
          fill: text_color
        } as never)
      )
    ]
  });

  return plot;
}
