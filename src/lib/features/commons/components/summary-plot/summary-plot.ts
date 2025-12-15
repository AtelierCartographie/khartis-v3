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
    width = 150,
    height = 64,
    main_color = '#a56eff',
    nulls_color = 'gold',
    text_color = '#f4f4f4',
    bg_color = '#222'
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
    marginBottom: 8,
    style: 'overflow: visible;',
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
          textAnchor: 'start',
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
          textAnchor: 'end',
        }
      ),
      // Interactive null count (only on hover)
      nullCount > 0
        ? [
          Plot.rectY(
            histogram.toArray().filter((d) => d.bin === null),
            Plot.pointerX({
              x: 'bin',
              y: 'count',
              stroke: 'currentColor',
            })
          ),
          // Null count text background (mask)
          Plot.text(
            histogram.toArray().filter((d) => d.bin === null),
            Plot.pointerX({
              x: 'bin',
              y: 0,
              text: () => 'XXXXXXXXXXXXXXX',
              dy: 8,
              fill: bg_color,
              stroke: bg_color,
              strokeWidth: 5,
            })
          ),
          // Null count text (appears on hover)
          Plot.text(
            histogram.toArray().filter((d) => d.bin === null),
            Plot.pointerX({
              x: 'bin',
              y: 0,
              text: () => `${nullCount.toLocaleString()} nulls`,
              dx: 8,
              dy: 8,
              fill: "grey",
              textAnchor: 'end'
            })
          )
        ]
        : null,
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

  // Handle null category => show "nulls"
  const get_label: LabelFunction = (label) =>
    label === null ? 'nulls' : label;

  // filter : [low_limit, high limit]
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

  // Handle fix text with pointer and stack mark
	// https://talk.observablehq.com/t/pointer-transforms-with-px-py-on-stacked-bar-charts/8302/8
	function renameXYPxPy(options: Record<string, unknown>): Record<string, unknown> {
		const { x, y, ...rest } = options;
		return { ...rest, px: x, py: y };
	}

  const plot = Plot.plot({
    width,
    height,
    marginLeft: 5,
    marginRight: 5,
    marginBottom: 8,
    marginTop: 5,
    style: 'overflow: visible;',
    x: { axis: null },
    marks: [
      // BARS
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

      // LABELS
      // special case all uniques values
      has_one_category
        ? Plot.textX(
            histogramArray as CategoryHistogramItem[],
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
        histogramArray as CategoryHistogramItem[],
        Plot.pointerX(
          Plot.stackX({
            x: 'count',
            stroke: 'currentColor',
            inset,
          } as ObservablePlotStackOptions)
        )
      ),
      // Mask the count of all categories
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
      // Show count and category in a fixed place
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
