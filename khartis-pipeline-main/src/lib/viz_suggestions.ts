/**
 * @module viz_suggest
 * @desc This module provides functions to suggest visualizations based on an analysis of a dataset.
 * Étape 0: utiliser la méthode 'analyse(table)' de Duck pour analyser une table
 * Étape 1: déterminer le typage sémiologique de chaque variable/colonne (QTA, QTR, QL, QLO, geoid, geolat, geolon)
 * Étape 2: déterminer les colonnes à utiliser en premier (celles qui remplissent le plus de critères optionnels et avec le moins d'absence de données)
 * Étape 3: appliquer les critères associés aux viz aux colonnes sélectionnées
 * @example
 */

export { get_viz_suggestions };

type GeometryType = 'point' | 'line' | 'polygon';
type SemioType = 'geoid' | 'geolat' | 'geolon' | 'QTA' | 'QTR' | 'QL' | 'QLO';
type JSType =
	| 'bigint'
	| 'number'
	| 'integer'
	| 'boolean'
	| 'string'
	| 'date'
	| 'other'
	| 'geometry';

interface ColumnIndicators {
	name: string;
	type: string;
	type_js: JSType;
	unique: number;
	uniques: number;
	share_integers: number;
	share_rank_interval: number;
	extent_magnitude: number;
	share_floats: number;
	ratio_words: boolean;
	sign: string;
	share_uniques: number;
	rank_words: boolean;
	share_nulls: number;
	id_words: boolean;
	lat_words: boolean;
	min: number;
	max: number;
	lon_words: boolean;
}

interface EnrichedColumnIndicators extends ColumnIndicators {
	type_semio: SemioType;
	score: number;
}

interface VizSuggestionOptions {
	geometry_type?: GeometryType;
	debug?: boolean;
}

interface VizCriteria {
	id: string;
	label_fr: string;
	nb_column: number;
	type_semio: SemioType[];
	geometry: GeometryType[];
	columns?: string[];
}

interface SemioTypeResult {
	type_semio: SemioType;
	score: number;
}

function get_viz_suggestions(dataset: ColumnIndicators[], options: VizSuggestionOptions = {}) {
	let { geometry_type = 'point', debug = false } = options;

	const dataset_with_type_semio = dataset
		.map(get_type_semio)
		.sort((a, b) => b.score - a.score || a.share_nulls - b.share_nulls)
		.filter((d) => d.type_semio !== 'geoid')
		.filter((d) => d.uniques != 1);

	if (debug)
		return {
			columns_indicators: dataset
				.map(get_type_semio)
				.sort((a, b) => b.score - a.score || a.share_nulls - b.share_nulls),
			viz: suggest_viz(dataset_with_type_semio, geometry_type)
		};

	return suggest_viz(dataset_with_type_semio, geometry_type);
}

/**
 * An object representing different types of semiotics.
 *
 * @constant {Object} SEMIO_TYPES
 * @property {string} GEOID - Geographic identifier or labels.
 * @property {string} GEOLAT - Latitude.
 * @property {string} GEOLON - Longitude.
 * @property {string} QTA - Absolute quantitative.
 * @property {string} QTR - Relative quantitative.
 * @property {string} QL - Qualitative.
 * @property {string} QLO - Ordered qualitative.
 */
const SEMIO_TYPES = {
	GEOID: 'geoid' as const,
	GEOLAT: 'geolat' as const,
	GEOLON: 'geolon' as const,
	QTA: 'QTA' as const,
	QTR: 'QTR' as const,
	QL: 'QL' as const,
	QLO: 'QLO' as const
};

/**
 * Determines the semantic type of a column based on its indicators.
 *
 * @param {Object} column_indicators - The indicators of the column.
 * @param {string} column_indicators.type_js - The JavaScript type of the column.
 * @param {number} column_indicators.unique - The number of unique values in the column.
 * @param {number} column_indicators.share_integers - The share of integer values in the column.
 * @param {number} column_indicators.share_rank_interval - The share of rank interval values in the column.
 * @param {number} column_indicators.extent_magnitude - The extent magnitude of the column values.
 * @param {number} column_indicators.share_floats - The share of float values in the column.
 * @param {boolean} column_indicators.ratio_words - Whether the column contains ratio words.
 * @param {string} column_indicators.sign - The sign of the column values.
 * @param {number} column_indicators.share_uniques - The share of unique values in the column.
 * @param {number} column_indicators.uniques - The number of unique values in the column.
 * @param {boolean} column_indicators.rank_words - Whether the column contains rank words.
 * @param {number} column_indicators.share_nulls - The share of null values in the column.
 * @param {boolean} column_indicators.id_words - Whether the column contains ID words.
 * @param {boolean} column_indicators.lat_words - Whether the column contains latitude words.
 * @param {number} column_indicators.min - The minimum value in the column.
 * @param {number} column_indicators.max - The maximum value in the column.
 * @param {boolean} column_indicators.lon_words - Whether the column contains longitude words.
 *
 * @returns {Object} The column with additional properties: name, type, type_js, type_semio, and score.
 */
function get_type_semio(column_indicators: ColumnIndicators): EnrichedColumnIndicators {
	let results: (SemioTypeResult | { type: undefined; score: number })[] = [];

	switch (column_indicators.type_js) {
		case 'bigint':
		case 'number':
		case 'integer': {
			results.push(
				is_QTA(column_indicators),
				is_QTR(column_indicators),
				is_QL(column_indicators),
				is_QLO(column_indicators),
				is_geoid(column_indicators),
				is_geolat(column_indicators),
				is_geolon(column_indicators)
			);
			break;
		}
		case 'boolean':
			results.push({ type_semio: SEMIO_TYPES.QL, score: 2 });
			break;
		case 'string': {
			results.push(
				is_QL(column_indicators),
				is_QLO(column_indicators),
				is_geoid(column_indicators)
			);
			break;
		}
		case 'date': {
			const type_semio = column_indicators.unique <= 10 ? SEMIO_TYPES.QL : SEMIO_TYPES.QTR;
			results.push({ type_semio, score: 2 });
			break;
		}
		case 'other':
		case 'geometry':
		default:
			results.push({ type: undefined, score: 0 });
	}

	const result = results.sort((a, b) => b.score - a.score)[0];

	if (
		'type_semio' in result &&
		result.type_semio === SEMIO_TYPES.QL &&
		column_indicators.uniques == 1
	) {
		result.score = 0;
	}

	const type_semio = 'type_semio' in result ? result.type_semio : SEMIO_TYPES.QL;

	return { ...column_indicators, type_semio, score: result.score };

	function is_QTA(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.share_integers >= 0.7) local_score += 1;
		if (indicators.share_integers >= 0.9) local_score += 1;
		if (indicators.share_rank_interval <= 0.1) local_score += 1;
		if (indicators.extent_magnitude >= 2) local_score += 1;
		return { type_semio: SEMIO_TYPES.QTA, score: local_score };
	}
	function is_QTR(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.share_floats >= 0.7) local_score += 1;
		if (indicators.share_floats >= 0.9) local_score += 1;
		if (indicators.ratio_words) local_score += 3;
		if (indicators.extent_magnitude <= 2) local_score += 0.5;
		if (indicators.sign === 'cross_zero') local_score += 0.5;
		return { type_semio: SEMIO_TYPES.QTR, score: local_score };
	}
	function is_QL(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.share_uniques <= 0.2) local_score += 2;
		if (indicators.uniques <= 10) local_score += 1;
		return { type_semio: SEMIO_TYPES.QL, score: local_score };
	}
	function is_QLO(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.rank_words) local_score += 4;
		if (indicators.share_rank_interval >= 0.8) local_score += 2;
		return { type_semio: SEMIO_TYPES.QLO, score: local_score };
	}
	function is_geoid(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.share_uniques >= 0.9) local_score += 1;
		if (indicators.share_nulls <= 0.1) local_score += 1.5;
		if (indicators.id_words && indicators.share_uniques >= 0.5) local_score += 4;
		return { type_semio: SEMIO_TYPES.GEOID, score: local_score };
	}
	function is_geolat(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.lat_words) local_score += 4;
		if (Math.abs(Number(indicators.min)) < 90 && Math.abs(Number(indicators.max)) < 90)
			local_score += 2;
		return { type_semio: SEMIO_TYPES.GEOLAT, score: local_score };
	}
	function is_geolon(indicators: ColumnIndicators): SemioTypeResult {
		let local_score = 0;
		if (indicators.lon_words) local_score += 4;
		if (Math.abs(Number(indicators.min)) < 180 && Math.abs(Number(indicators.max)) < 180)
			local_score += 2;
		return { type_semio: SEMIO_TYPES.GEOLON, score: local_score };
	}
}

/**
 * Searches for visualizations based on the dataset type, geometry, and number of columns.
 *
 * @param {Object|Array} dataset - The dataset or array of datasets to search visualizations for.
 *                                 If `nb` is 1, this should be a single dataset object.
 *                                 If `nb` is 2, this should be an array of two dataset objects.
 * @param {string} geom - The geometry type to filter visualizations by.
 * @param {number} nb - The number of columns in the dataset (1 or 2).
 * @returns {Array} - A list of visualization criteria objects that match the given parameters.
 */
function search_viz_by_type(
	dataset: EnrichedColumnIndicators | EnrichedColumnIndicators[],
	geom: GeometryType,
	nb: 1 | 2
): VizCriteria[] {
	let list: VizCriteria[] = [];
	if (nb === 1 && !Array.isArray(dataset)) {
		list = viz_criteria
			.filter((d) => d.geometry.includes(geom))
			.filter((d) => d.nb_column === nb)
			.filter((d) => d.type_semio.includes(dataset.type_semio))
			.map((d) => ({ ...d, columns: [dataset.name] })) as VizCriteria[];
	}
	if (nb === 2 && Array.isArray(dataset) && dataset.length === 2) {
		list = viz_criteria
			.filter((d) => d.geometry.includes(geom))
			.filter((d) => d.nb_column === nb)
			.filter(
				(d) =>
					(d.type_semio[0] === dataset[0].type_semio &&
						d.type_semio[1] === dataset[1].type_semio) ||
					(d.type_semio[1] === dataset[0].type_semio && d.type_semio[0] === dataset[1].type_semio)
			)
			.map((d) => ({ ...d, columns: [dataset[0].name, dataset[1].name] })) as VizCriteria[];
	}

	return list;
}

/**
 * Suggests visualizations based on the provided array of column indicators and geometry type.
 *
 * @param {Array} dataset - The dataset is an array of column indicators.
 * @param {string} geometry_type - The type of geometry to consider for visualizations. (point, line, polygon)
 * @returns {Array} An array of suggested visualizations.
 */
function suggest_viz(
	dataset: EnrichedColumnIndicators[],
	geometry_type: GeometryType
): VizCriteria[] {
	let results: VizCriteria[] = [];

	switch (dataset.length) {
		case 0:
			results = viz_criteria.filter(
				(d) => d.geometry.includes(geometry_type) && d.type_semio.length === 0
			) as VizCriteria[];
			break;

		case 1:
			results = search_viz_by_type(dataset[0], geometry_type, 1);
			break;

		default:
			const first_two = dataset.slice(0, 2);
			const res_one = first_two.flatMap((d: EnrichedColumnIndicators) =>
				search_viz_by_type(d, geometry_type, 1)
			);
			const res_two = search_viz_by_type(first_two, geometry_type, 2);
			results = [...new Set([...res_one, ...res_two])];
	}
	if (results.length < 3 && dataset.length >= 3) {
		results.push(...search_viz_by_type(dataset[2], geometry_type, 1));
		results.push(...search_viz_by_type([dataset[0], dataset[2]], geometry_type, 2));
		results.push(...search_viz_by_type([dataset[1], dataset[2]], geometry_type, 2));
		results = [...new Set(results)];
	}

	if (results.length < 3 && dataset.length >= 4) {
		results.push(...search_viz_by_type(dataset[3], geometry_type, 1));
		results.push(...search_viz_by_type([dataset[0], dataset[3]], geometry_type, 2));
		results.push(...search_viz_by_type([dataset[1], dataset[3]], geometry_type, 2));
		results.push(...search_viz_by_type([dataset[2], dataset[3]], geometry_type, 2));
		results = [...new Set(results)];
	}

	return results;
}

/**
 * Liste des viz qui peuvent être suggérées avec les critères d'application pour chaque viz :
 * typage sémiologique, géométrie et nombre de colonnes.
 * Voir ce tableau : https://docs.google.com/spreadsheets/d/1F6gk998PXV4FvPNRJZ59YPnmsXJ4h6BLyRZupvrRRdw/edit#gid=0
 */
const viz_criteria: readonly VizCriteria[] = [
	{
		id: 'symbols_uniques',
		label_fr: 'Symboles uniques',
		nb_column: 1,
		type_semio: [],
		geometry: ['point', 'polygon']
	},
	{
		id: 'polygons_colorful_QL',
		label_fr: 'Polygones colorés (QL)',
		nb_column: 1,
		type_semio: ['QL'],
		geometry: ['polygon']
	},
	{
		id: 'polygons_colorful_QTR',
		label_fr: 'Choroplète',
		nb_column: 1,
		type_semio: ['QTR'],
		geometry: ['polygon']
	},
	{
		id: 'symbols_uniques_colorful_QTR',
		label_fr: 'Symboles uniques colorés (QTR)',
		nb_column: 1,
		type_semio: ['QTR'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_differents',
		label_fr: 'Symboles différents (QL)',
		nb_column: 1,
		type_semio: ['QL'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_uniques_colorful_QL',
		label_fr: 'Symboles uniques colorés (QL)',
		nb_column: 1,
		type_semio: ['QL'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_proportionnal',
		label_fr: 'Symboles proportionnels',
		nb_column: 1,
		type_semio: ['QTA'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_proportionnal_colorful_QL',
		label_fr: 'Symboles proportionnels colorés (QL)',
		nb_column: 2,
		type_semio: ['QTA', 'QL'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_proportional_colorful_QTR',
		label_fr: 'Symboles proportionnels colorés (QTR)',
		nb_column: 2,
		type_semio: ['QTA', 'QTR'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_proportional_double',
		label_fr: 'Double symboles proportionnels',
		nb_column: 2,
		type_semio: ['QTA', 'QTA'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'polygons_uniques',
		label_fr: 'Polygones uniques',
		nb_column: 1,
		type_semio: [],
		geometry: ['polygon']
	},

	{
		id: 'lines_uniques',
		label_fr: 'Lignes uniques',
		nb_column: 1,
		type_semio: [],
		geometry: ['line']
	},
	{
		id: 'lines_colorful_QL',
		label_fr: 'Lignes colorés (QL)',
		nb_column: 1,
		type_semio: ['QL'],
		geometry: ['line']
	},
	{
		id: 'lines_colorful_QTR',
		label_fr: 'Lignes colorés (QTR)',
		nb_column: 1,
		type_semio: ['QTR'],
		geometry: ['line']
	},
	{
		id: 'lines_proportional',
		label_fr: 'Lignes proportionnels',
		nb_column: 1,
		type_semio: ['QTA'],
		geometry: ['line']
	},
	{
		id: 'lines_proportional_colorful_QL',
		label_fr: 'Lignes proportionnels colorés (QL)',
		nb_column: 2,
		type_semio: ['QTA', 'QL'],
		geometry: ['line']
	},
	{
		id: 'lines_proportional_colorful_QTR',
		label_fr: 'Lignes proportionnels colorés (QTR)',
		nb_column: 2,
		type_semio: ['QTA', 'QTR'],
		geometry: ['line']
	},
	{
		id: 'polygons_colorful_QLO',
		label_fr: 'Polygones colorés (QLO)',
		nb_column: 1,
		type_semio: ['QLO'],
		geometry: ['polygon']
	},
	{
		id: 'symbols_differents_QLO',
		label_fr: 'Symboles différents (QLO)',
		nb_column: 1,
		type_semio: ['QLO'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'symbols_uniques_colorful_QLO',
		label_fr: 'Symboles uniques colorés (QLO)',
		nb_column: 1,
		type_semio: ['QLO'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'lines_colorful_QLO',
		label_fr: 'Lignes colorés (QLO)',
		nb_column: 1,
		type_semio: ['QLO'],
		geometry: ['line']
	},
	{
		id: 'texts_colorful_QL',
		label_fr: 'Textes colorés (QL)',
		nb_column: 2,
		type_semio: ['QL', 'QL'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'texts_colorful_QTR',
		label_fr: 'Textes colorés (QTR)',
		nb_column: 2,
		type_semio: ['QL', 'QTR'],
		geometry: ['point', 'polygon']
	},
	{
		id: 'texts_proportional',
		label_fr: 'Textes proportionnels',
		nb_column: 2,
		type_semio: ['QL', 'QTA'],
		geometry: ['point', 'polygon']
	}
] as const;
