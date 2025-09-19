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

type NumericHistogram = ArrayWithToArrayMethod<HistogramBin>;
type CategoricalHistogram = ArrayWithToArrayMethod<CategoryHistogramItem>;

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
}

interface NumericData {
	type_simple: 'numeric' | 'date';
	min: number | Date;
	max: number | Date;
	histogram: NumericHistogram;
}

interface CategoricalData {
	type_simple: 'string';
	histogram: CategoricalHistogram;
	uniques?: number;
}

type SummaryData = NumericData | CategoricalData;

type LabelFunction = (label: string | null) => string;
type FilterFunction = (d: CategoryHistogramItem) => boolean;
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

type PlotData = HistogramBin[] | CategoryHistogramItem[] | NumericHistogram | CategoricalHistogram;

/**
 * Creates a summary plot based on the type of data provided.
 */
export function create_summary_plot(data: SummaryData, options: SummaryPlotOptions = {}) {
	const { type_simple } = data;
	switch (type_simple) {
		case 'numeric':
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
function create_plot_numeric(data: NumericData, options: SummaryPlotOptions = {}) {
	let { width = 144, height = 64, main_color = '#a56eff', nulls_color = 'gold' } = options;
	const { min, max, histogram, type_simple } = data;

	const is_date = type_simple === 'date';

	const text_options = {
		y: 0,
		dy: 8,
		fontVariant: 'tabular-nums'
	};

	return Plot.plot({
		width,
		height,
		marginBottom: 15,
		x: { axis: null, type: 'band' },
		y: { axis: null },
		marks: [
			Plot.rectY(histogram.toArray(), {
				x: 'bin',
				y: 'count',
				fill: (d) => (d.bin !== null ? main_color : nulls_color)
			}),
			Plot.ruleY([0]),
			Plot.text(
				[is_date ? (min as Date)?.toLocaleDateString() : (min as number)?.toLocaleString()],
				{
					...text_options,
					dx: -(width / 2),
					textAnchor: 'start'
				}
			),
			Plot.text(
				[is_date ? (max as Date)?.toLocaleDateString() : (max as number)?.toLocaleString()],
				{
					...text_options,
					dx: width / 2,
					textAnchor: 'end'
				}
			)
		]
	});
}

/**
 * Creates a categorical plot using the provided data and options.
 *
 * @param {Object} data - The data to be plotted.
 * @param {Object} [options={}] - Configuration options for the plot.
 * @param {number} [options.width=144] - The width of the plot.
 * @param {number} [options.height=64] - The height of the plot.
 * @param {boolean} [options.geoid=false] - Whether to treat the data as geoid.
 * @param {string} [options.main_color='#fa4d56'] - The main color for the rectangles.
 * @param {string} [options.nulls_color='gold'] - The color for null values.
 * @param {string} [options.unique_color='grey'] - The color for unique values.
 * @param {string} [options.stroke_main='none'] - The stroke color for main values.
 * @param {string} [options.stroke_nulls='none'] - The stroke color for null values.
 * @param {string} [options.stroke_unique='none'] - The stroke color for unique values.
 * @returns {Object} The generated plot.
 */
function create_plot_categorical(data: CategoricalData, options: SummaryPlotOptions = {}) {
	let {
		width = 144,
		height = 64,
		geoid = false,
		main_color = '#fa4d56',
		nulls_color = 'gold',
		unique_color = 'grey',
		stroke_main = 'none',
		stroke_nulls = 'none',
		stroke_unique = 'none'
	} = options;

	let { uniques, histogram } = data;
	let histogramData: CategoricalHistogram | CategoryHistogramItem[] = histogram;

	// .toArray() to keep null at the end
	if (geoid) {
		const array = histogram.toArray();
		const has_unique = array.find((d: CategoryHistogramItem) => d.category === 'unique');
		// If for geoid, category unique has to appear first
		if (has_unique)
			histogramData = [
				has_unique,
				...array.filter((d: CategoryHistogramItem) => d.category !== 'unique')
			];
	}

	// Handle null category => show "nulls"
	const get_label: LabelFunction = (label) => (label === null ? 'nulls' : label);

	// filter : [low_limit, high limit]
	const label_layer = (filter: PercentRange, lineWidth: number) =>
		Plot.textX(
			histogramData as CategoryHistogramItem[], // Assertion typée pour ObservablePlot
			Plot.stackX({
				text: (d: CategoryHistogramItem) =>
					d.percent >= filter[0] && d.percent < filter[1] ? get_label(d.category) : null,
				x: 'count',
				lineWidth,
				textOverflow: 'clip-end'
			} as ObservablePlotStackOptions) // Assertion typée pour ObservablePlot
		);

	const numRows = data.histogram.numRows;
	// Adapt inset on number of categories. More categories = less inset.
	// Why? Whitout, rectangles are invisible with too much categories
	const inset: number | undefined = numRows > 30 ? undefined : numRows > 20 ? 0.2 : 0.5;

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
			// Handle fix text with pointer and stack mark
			// https://talk.observablehq.com/t/pointer-transforms-with-px-py-on-stacked-bar-charts/8302/8

			// BARS
			Plot.barX(
				histogramData as CategoryHistogramItem[],
				Plot.stackX({
					x: 'count',
					fill: (d: CategoryHistogramItem) =>
						d.category === 'unique' ? unique_color : d.category === null ? nulls_color : main_color,
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
			!has_one_category ? label_layer([0.8, 1], 9) : null, // handle value near 1 like 0.99999
			label_layer([0.6, 0.8], 6),
			label_layer([0.4, 0.6], 5),
			label_layer([0.2, 0.4], 3),
			label_layer([0.15, 0.2], 2),
			label_layer([0.1, 0.15], 1),
			has_one_category
				? null
				: Plot.text([(uniques ?? 0).toLocaleString() + ' catégories'], {
						frameAnchor: 'bottom-left',
						dy: 10
					}),

			// INTERACTIVITY
			// Highlight bar
			Plot.barX(
				histogramData as CategoryHistogramItem[],
				Plot.pointerX(
					Plot.stackX({
						x: 'count',
						stroke: 'currentColor',
						inset
					} as ObservablePlotStackOptions)
				)
			),
			// Mask the count of all categories
			Plot.text(
				histogramData as CategoryHistogramItem[],
				Plot.pointerX({
					px: 'count',
					text: (d: CategoryHistogramItem) => 'XXXXXXXXXXXXXXXXXXX',
					frameAnchor: 'bottom-left',
					dy: 10,
					fill: '#222',
					stroke: '#222',
					strokeWidth: 5
				} as never)
			),
			// Show count and category in a fixed place
			Plot.text(
				histogramData as CategoryHistogramItem[],
				Plot.pointerX({
					px: 'count',
					text: (d: CategoryHistogramItem) => `${d.count.toLocaleString()} - ${d.category}`,
					frameAnchor: 'bottom-left',
					dy: 10
				} as never)
			)
		]
	});

	return plot;
}
