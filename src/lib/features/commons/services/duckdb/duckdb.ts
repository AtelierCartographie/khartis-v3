import * as duckdb from '@duckdb/duckdb-wasm';
import { tableFromIPC, type Table } from '@uwdata/flechette';
import { analyse } from './analyse';
import { breaks } from './breaks';
import { join_macros } from './join';

// --- Constants used by Duck class ---
const DUCK_CONST = {
	DEFAULT: {
		DECIMAL_SEPARATOR: '.',
		FORMAT_TABULAR: 'csv',
		NULL_VALUES: `['', ':', 'null', 'NULL', 'NA', 'NaN', 'none']`,
		SOURCE: 'user'
	},
	QUERY_FORMAT: {
		ARROW_TABLE: 'arrow-table' as const,
		ARROW_IPC: 'arrow-ipc' as const,
		ARRAY: 'array' as const
	},
	TYPE: {
		TABULAR: 'tabular' as const,
		GEOFILE: 'geofile' as const,
		PARQUET: 'parquet' as const
	},
	REGEX: {
		TABULAR: /\.(csv|tsv|text|txt)/i,
		GEO: /\.(geojson|json|gpkg|kml)/i,
		PARQUET: /\.(parquet|geoparquet)/i,
		COLUMN_VALIDATION_INTEGER: /^-?\d+$/,
		COLUMN_VALIDATION_DOUBLE: /^-?\d+(\.\d+)?$/,
		COLUMN_VALIDATION_BOOLEAN_NUMBER: /[0-1]/,
		COLUMN_VALIDATION_BOOLEAN_STRING: /^(true|false)$/i,
		COLUMN_VALIDATION_DATE: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+\-]\d{2}:\d{2})?$/
	}
};

// --- HELPER FUNCTIONS ---
type QueryFormat = (typeof DUCK_CONST.QUERY_FORMAT)[keyof typeof DUCK_CONST.QUERY_FORMAT];
type FileType = (typeof DUCK_CONST.TYPE)[keyof typeof DUCK_CONST.TYPE];

interface FileWithId extends File {
	id: string;
}

interface QueryOptions {
	format?: QueryFormat;
	useProxy?: boolean;
}

import type {
	AnalysisResult,
	AnalysisResults,
	ArrowTableLike,
	BreakInsideResult,
	BreaksResult,
	BreaksRoundedResult,
	CountResult,
	DuckDBMetadata,
	DuckDBValue,
	ValidationResult
} from './types/index.js';

interface TableMetadata {
	analysis?: AnalysisResults | null;
	join: JoinInfo | null;
	filters: Map<number, string>;
}

interface JoinInfo {
	id: string;
	join_results_name: string;
	basemap_join_ref: string | null;
}

interface ReadTabularOptions {
	tablename?: string;
	decimal_separator?: string;
	format?: string;
}

interface ReadGeofileOptions {
	tablename?: string;
	meta?: boolean;
}

interface ReadLinkOptions {
	tablename?: string;
	decimal_separator?: string;
}

interface GetDataOptions {
	geometry?: boolean;
}

interface CalculateBreaksOptions {
	method?: string;
	nclass?: number;
	nclass_right?: number;
	round?: boolean;
	break_value?: number | null;
}

interface AnalyseOptions {
	force?: boolean;
}

interface JoinByIdOptions {
	basemaps_table?: string;
	basemap_table?: string;
	basemap_id?: string;
	basemap_others_id?: string;
}

interface RegisterFilesOptions {
	shapefile?: boolean;
}

/**
 * Normalizes a string by removing accents, special characters, etc.
 * @param {string} str The string to normalize.
 * @returns {string} The normalized string.
 */
function normalize_name(str: string): string {
	let normalized = str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/(\.\.|[/\\\\])/g, '')
		.replace(/[^a-zA-Z0-9_.]/g, '_');

	if (/^[0-9]/.test(normalized)) {
		normalized = 'a_' + normalized;
	}

	const maxLength = 150;
	if (normalized.length > maxLength) {
		normalized = normalized.substring(0, maxLength);
	}

	return normalized;
}

/**
 * Extract the filename from an url.
 * @param {string} url The url.
 * @returns {string} filename The filename.
 */
function extract_filename(url: string): string {
	return url.split('/').pop() || '';
}

/**
 * Get the type of file.
 * @param {string} filename The filename.
 * @returns {string} The type of file.
 */
function get_file_type(filename: string): FileType {
	if (DUCK_CONST.REGEX.TABULAR.test(filename)) return DUCK_CONST.TYPE.TABULAR;
	if (DUCK_CONST.REGEX.GEO.test(filename)) return DUCK_CONST.TYPE.GEOFILE;
	if (DUCK_CONST.REGEX.PARQUET.test(filename)) return DUCK_CONST.TYPE.PARQUET;
	return DUCK_CONST.TYPE.TABULAR;
}

/**
 * Generates a unique table name from a filename.
 * @param {string} filename The original filename.
 * @param {Map<string, string>} existingNames A Map where keys are existing table names.
 * @returns {string} A unique table name.
 */
function generate_unique_table_name(filename: string, existingNames: Map<string, string>): string {
	const split_filename = (name: string): string => {
		const index = name.indexOf('.');
		if (index === -1) return name;
		return name.slice(0, index);
	};
	let tablename = normalize_name(filename);
	let counter = 1;
	tablename = split_filename(tablename);
	while (existingNames.has(tablename)) {
		tablename = `${tablename}_${counter}`;
		counter++;
	}
	return tablename;
}

/**
 * Adds a unique identifier to a file object.
 * The ID is a combination of the file's last modified timestamp and a normalized version of its name.
 * This ensures each file has a distinct identifier, even if multiple files share the same name.
 *
 * @param {Object} file - The file object to which the ID will be added.
 * @param {number} file.lastModified - The last modified time of the file.
 * @param {string} file.name - The name of the file.
 */
function add_file_id(file: FileWithId): void {
	file.id = file.lastModified + '-' + normalize_name(file.name);
}

/**
 * Check if the value is an integer.
 * @param {number|string} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid integer, otherwise false.
 */
const isValidInteger = (value: number | string): boolean =>
	(typeof value === 'number' && Number.isInteger(value)) ||
	(typeof value === 'string' && DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test(value));

/**
 * Check if the value is a float.
 * @param {number|string} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid float, otherwise false.
 */
const isValidFloat = (value: number | string): boolean =>
	typeof value === 'number' ||
	(typeof value === 'string' && DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test(value));

/**
 * Check if the value is a boolean.
 * @param {number|string|boolean} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid boolean, otherwise false.
 */
const isValidBoolean = (value: number | string | boolean): boolean =>
	typeof value === 'boolean' ||
	typeof value === 'number' ||
	(typeof value === 'string' &&
		(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test(value) ||
			DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test(value)));

/**
 * Validates and potentially casts a value based on a specified column type.
 * @param {*} new_value The value to validate.
 * @param {string} column_type The type of the column.
 * @returns {{isValid: boolean, value: *}} An object with isValid and the potentially cast value.
 */
function validate_and_cast_value(new_value: unknown, column_type: string): ValidationResult {
	let isValid = false;
	let value: DuckDBValue = new_value as DuckDBValue;

	switch (column_type.toLowerCase()) {
		case 'integer':
		case 'bigint':
			isValid = isValidInteger(new_value as string | number);
			value = typeof new_value === 'string' ? parseInt(new_value, 10) : (new_value as number);
			break;
		case 'number':
			isValid = isValidFloat(new_value as string | number);
			value = typeof new_value === 'string' ? parseFloat(new_value) : (new_value as number);
			break;
		case 'string':
			isValid = true;
			value = String(new_value);
			break;
		case 'boolean':
			isValid = isValidBoolean(new_value as string | number | boolean);
			if (typeof new_value === 'number' || typeof new_value === 'boolean')
				value = Boolean(new_value);
			else if (typeof new_value === 'string') {
				if (new_value.toLowerCase() === 'true' || new_value === '1') value = true;
				if (new_value.toLowerCase() === 'false' || new_value === '0') value = false;
			}
			break;
		case 'date':
			if (
				new_value instanceof Date ||
				(typeof new_value === 'string' && !isNaN(Date.parse(new_value)))
			) {
				isValid = true;
				if (!(new_value instanceof Date)) value = new Date(new_value);
			}
			break;
		case 'geometry':
		case 'other':
		default:
			throw new Error(`Unsupported column type: ${column_type}.`);
	}
	return { isValid, value };
}

// --- DuckDB Class ---
/**
 * DuckDB class provides an interface to interact with DuckDB, a high-performance analytical database.
 * It supports operations such as initializing the database, reading tabular data, registering files,
 * generating unique table names, and performing spatial operations.
 *
 * @class DuckDB
 * @property {Object} db - The DuckDB instance.
 * @property {Object} connection - The connection to the DuckDB instance.
 * @property {Map} loaded_files - A map storing table names and their corresponding filenames.
 * @property {Set} registered_files - A set storing registered files.
 * @property {Map} table_metadata - A map storing metadata for each table (analysis, filters, join associations).
 *
 *
 * @method constructor() - Initializes a new instance of the DuckDB class.
 * @method init() - Initializes the DuckDB instance and connects to the database.
 * @method close() - Closes the DuckDB connection.
 * @method reset() - Resets the DuckDB instance but keeps the database open and the session.
 * @method #add_row_id(table) - Adds a row ID column to a specified table.
 * @method query(query, options) - Executes a SQL query and returns the result in the specified format.
 * @method register_files(files, options) - Registers files with the DuckDB instance.
 * @method get_loaded_files() - Retrieves the list of loaded files.
 * @method #get_table_metadata() - Retrieves the metadata for a given table.
 * @method read_tabular(input, options) - Reads tabular data from a given input and creates a table in DuckDB.
 * @method read_geofile(geofile, options) - Reads a geofile and optionally retrieves its metadata or creates a table from it.
 * @method read_link(url, options) - Reads a file from a given URL and creates a table in the database.
 * @method describe_table(table) - Describes the structure of a specified table by querying its columns.
 * @method get_row_count(table) - Retrieves the row count of a specified table.
 * @method get_data(table, options) - Retrieves data from the specified table as an arrow table.
 * @method sort_table(table, column, order) - Sorts a table by a specified column in the given order.
 * @method rename_column(table, old_name, new_name) - Renames a column in a specified table.
 * @method change_column_type(table, column, new_type) - Changes the data type of a specified column in a given table.
 * @method change_column_case(table, column, caseType) - Changes the case of all values in a specified column of a table.
 * @method trim_column(table, column) - Trims whitespace from the specified column in the given table.
 * @method drop_column(table, column) - Drops a column from a specified table in the database.
 * @method drop_rows(table, rows_id) - Drops rows from a specified table where the column value matches the specified value.
 * @method update_cell(table, id_column, id_value, column, new_value) - Update a cell value in the table.
 * @method add_filter(table, key_index, filter) - Adds a filter to the specified table.
 * @method remove_filter(table, key_index) - Removes a filter from the specified table.
 * @method apply_filters(table) - Applies the filters and executes the query for a specific table.
 * @method latlon_to_point(table, columns) - Converts latitude and longitude columns to a geometric point and adds it to the specified table.
 * @method copy_to_geoparquet_as_buffer(table) - Copies a table to a GeoParquet file with ZSTD compression and returns it as a buffer.
 * @method export_table(table, format) - Exports a table to a specified format (CSV, Parquet, or GeoParquet).
 * @method calculate_class_breaks(table, column, options) - Retrieves break points for a specified column in a table using various methods.
 * @method add_class(table, column, breaks) - Adds a classification column to the specified table based on the provided breaks.
 * @method analyse(table) - Analyzes the specified table and returns various statistical summaries and histograms.
 * @method join_by_id(table, table_id, options) - Joins a table to one or multiple basemaps based on the similarity of an ID column.
 * @method apply_join_association(table, basemap) - Applies a join association to a table based on a previously performed join operation.
 */
class DuckDB {
	public db: duckdb.AsyncDuckDB | null = null;
	public connection: duckdb.AsyncDuckDBConnection | null = null;
	public loaded_files: Map<string, string> = new Map();
	public registered_files: Set<string> = new Set();
	public table_metadata: Map<string, TableMetadata> = new Map();
	public table_geoparquet_cache: Map<string, Uint8Array> = new Map();

	constructor() {}

	// New DuckDb instance + spatial extension
	async init(): Promise<void> {
		try {
			// Select a bundle based on browser checks
			const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
			const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
			const worker_url = URL.createObjectURL(
				new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
			);
			// Instantiate the asynchronous version of DuckDB-wasm
			const worker = await duckdb.createWorker(worker_url);
			const logger = new duckdb.ConsoleLogger();
			this.db = new duckdb.AsyncDuckDB(logger, worker);
			URL.revokeObjectURL(worker_url);
			await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
			await this.db.open({
				filesystem: { allowFullHTTPReads: true, reliableHeadRequests: true },
				query: { castBigIntToDouble: false }
			});
			this.connection = await this.db.connect();
			await this.query(`INSTALL spatial; LOAD spatial;`, {
				format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
			});
			// load all macro for discretization, data analysis and join operations
			await this.query(breaks + analyse + join_macros, {
				format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
			});
		} catch (error) {
			console.error('Failed to initialize DuckDB:', error);
			throw error;
		}
	}

	/**
	 * Close DuckDB connection.
	 */
	async close(): Promise<void> {
		await this.connection?.close();
	}

	/**
	 * Reset the DuckDB instance but keep the database open and the session.
	 */
	async reset(): Promise<void> {
		this.loaded_files.clear();
		this.registered_files.clear();
		this.table_metadata.clear();
		this.table_geoparquet_cache.clear();
		await this.connection?.close();
		await this.db?.dropFiles();
		await this.db?.reset;
	}

	/**
	 * Adds a row ID column to a specified table.
	 *
	 * @param {string} table - The name of the table to add the row ID column to.
	 */
	private async add_row_id(table: string): Promise<void> {
		await this.query(
			`CREATE OR REPLACE SEQUENCE id_${table} START 1;
		ALTER TABLE ${table} ADD COLUMN __id INTEGER DEFAULT nextval('id_${table}');`,
			{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
		);
	}

	/**
	 * Executes a SQL query and returns the result in the specified format.
	 * The default format is an Arrow table.
	 * Use @uwdata/flechette under the hood to convert Arrow buffer (IPC) to Arrow table.
	 *
	 * @param {string} query - The SQL query to execute.
	 * @param {Object} [options={}] - Optional settings for the query execution.
	 * @param {string} [options.format='arrow-table'] - The format of the result. Can be 'arrow-table', 'arrow-ipc', or 'array'.
	 * @param {boolean} [options.useProxy=true] - Whether to use Proxy object for performance optimization.
	 * @returns {Promise<*>} - The result of the query in the specified format.
	 */
	async query(query: string, options: QueryOptions = {}): Promise<unknown> {
		let { format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE, useProxy = true } = options;

		// Return an Arrow table with Flechette
		// 1. return an arrow IPC (buffer)
		const buffer = await this.connection!.useUnsafe(async (bindings: unknown, conn: unknown) => {
			return await (bindings as any).runQuery(conn, query);
		});
		if (format === DUCK_CONST.QUERY_FORMAT.ARROW_IPC) return buffer;

		// 2. Return an Arrow table with Flechette
		const table = tableFromIPC(buffer, {
			useBigInt: true,
			useDate: true,
			useDecimalInt: false,
			useMap: true,
			useProxy // Le véritable gain de performance se fait avec l'utilisation de Proxy
		});
		if (format === DUCK_CONST.QUERY_FORMAT.ARROW_TABLE) return table;

		// 3. Return an array with proxy or a pure js array of objects
		if (format === DUCK_CONST.QUERY_FORMAT.ARRAY) return table.toArray();
	}

	/**
	 * Registers a list of files with the DuckDB database.
	 *
	 * This method iterates over the provided files, assigns an ID to each file,
	 * and registers the file with the DuckDB database if it hasn't been registered already.
	 *
	 * @async
	 * @param {File[]} files - An array of File objects to be registered.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {boolean} [options.shapefile=false] - If true, all sibling files will have the same id, necessary for the spatial extension.
	 * @returns {Promise<void>} - A promise that resolves when all files are registered.
	 */
	async register_files(files: File[], options: RegisterFilesOptions = {}): Promise<void> {
		let { shapefile = false } = options;
		let shape_date: number | undefined;
		if (shapefile) {
			const shp = files.reverse().find((file) => file.name.endsWith('.shp'));
			shape_date = shp?.lastModified;
		}
		for (const file of files) {
			const fileWithId = file as FileWithId;
			shapefile && shape_date
				? (fileWithId.id = shape_date + '-' + normalize_name(file.name))
				: add_file_id(fileWithId);
			if (this.registered_files.has(fileWithId.id)) {
				continue;
			}
			await this.db!.registerFileHandle(
				fileWithId.id,
				file,
				duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
				true
			);
			this.registered_files.add(fileWithId.id);
		}
	}

	/**
	 * Retrieves the list of loaded files.
	 *
	 * @returns {Array<{tablename: string, filename: string}>} An array of objects, each containing:
	 *   - {string} tablename - The name of the table in the database.
	 *   - {string} filename - The original filename associated with the table.
	 *
	 */
	get_loaded_files(): Array<{ tablename: string; filename: string }> {
		if (this.loaded_files.size === 0) return [];
		return Array.from(this.loaded_files, ([tablename, filename]) => ({
			tablename,
			filename
		}));
	}

	/**
	 * Retrieves the metadata for a given table.
	 *
	 * @param {string} table - The name of the table.
	 * @returns {Object} - The metadata object for the table, containing:
	 *   - {Object|null} analysis - The analysis results for the table, or null if not analyzed.
	 *   - {Object|null} join - The join association information for the table, or null if no join has been performed.
	 *     - {string} id - The name of the ID column used for the join.
	 *     - {string} join_results_name - The name of the table containing the join results.
	 *     - {string|null} basemap_join_ref - The name of the basemap join reference table, or null if not applicable.
	 *   - {Map<number, string>} filters - A map of filters applied to the table, where the key is the filter index and the value is the filter condition.
	 */
	private get_table_metadata(table: string): TableMetadata {
		if (!this.table_metadata.has(table))
			this.table_metadata.set(table, {
				analysis: null,
				join: null,
				filters: new Map()
			});
		return this.table_metadata.get(table)!;
	}

	/**
	 * Reads tabular data from a given input and creates a table in DuckDB.
	 *
	 * @async
	 * @param {string|File} input - The input data, either a string or a File object.
	 * @param {Object} [options] - Optional parameters.
	 * @param {string} [options.tablename] - The name of the table to create. If not provided, a unique name will be generated.
	 * @param {string} [options.decimal_separator=','] - The decimal separator used in the CSV data.
	 * @param {string} [options.format='csv'] - The format of the input data. Can be 'csv' or 'parquet'.
	 * @returns {Promise<string>} - The name of the created table.
	 * @throws {Error} - Throws an error if the input type is invalid or if the table creation fails.
	 */
	async read_tabular(input: string | File, options: ReadTabularOptions = {}): Promise<string> {
		let {
			tablename,
			decimal_separator = DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR,
			format = DUCK_CONST.DEFAULT.FORMAT_TABULAR
		} = options;
		let filename: string; // original filename
		let fileid: string; // filename use for registering the file in DuckDB
		try {
			// input = COPY-PASTE
			if (typeof input === 'string') {
				if (!tablename) tablename = generate_unique_table_name('data_paste', this.loaded_files);
				filename = tablename;
				fileid = tablename;
				await this.db!.registerFileText(filename, input);
				// input = FILE
			} else if (input instanceof File) {
				filename = input.name;
				if (!tablename) tablename = generate_unique_table_name(filename, this.loaded_files);
				await this.register_files([input]);
				fileid = (input as FileWithId).id;
			} else {
				throw new Error('Invalid input type. Expected a string or a File.');
			}
			// Read the tabular data and create a table
			if (format === DUCK_CONST.DEFAULT.FORMAT_TABULAR) {
				await this.query(
					`CREATE OR REPLACE TABLE ${tablename} AS FROM read_csv('${fileid}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`,
					{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
				);
				await this.add_row_id(tablename);
			}
			if (format === DUCK_CONST.TYPE.PARQUET) {
				await this.query(
					`CREATE OR REPLACE TABLE ${tablename} AS FROM read_parquet('${fileid}');`,
					{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
				);
				await this.add_row_id(tablename);
			}
			this.loaded_files.set(tablename, filename);
			return tablename;
		} catch (error) {
			console.error('Failed to read tabular data:', error);
			throw error;
		}
	}

	async read_geofile(
		geofile: File,
		options: ReadGeofileOptions = {}
	): Promise<DuckDBMetadata | string> {
		let { tablename, meta = false } = options;
		try {
			await this.register_files([geofile]);
			const geofileWithId = geofile as FileWithId;
			if (meta) {
				const result = await this.query(`FROM ST_Read_Meta('${geofileWithId.id}')
					SELECT 
						file_name AS name, 
						driver_short_name AS format, 
						layers[1].feature_count AS nb_entities, 
						layers[1].geometry_fields[1].type AS geometry, 
						layers[1].geometry_fields[1].crs.name AS crs`);
				return result as DuckDBMetadata;
			}
			if (!tablename) tablename = generate_unique_table_name(geofile.name, this.loaded_files);
			await this.query(
				`CREATE OR REPLACE TABLE ${tablename} AS FROM ST_Read('${geofileWithId.id}');`,
				{
					format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
				}
			);
			await this.add_row_id(tablename);
			this.loaded_files.set(tablename, geofile.name);
			console.log('Table created:', tablename);
			return tablename;
		} catch (error) {
			console.error('Failed to read geofile:', error);
			throw error;
		}
	}

	async read_link(url: string, options: ReadLinkOptions = {}): Promise<string> {
		let { tablename, decimal_separator = DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR } = options;

		const filename = extract_filename(url);
		const file_type = get_file_type(filename);

		if (!tablename) tablename = generate_unique_table_name(filename, this.loaded_files);
		await this.db!.registerFileURL(filename, url, duckdb.DuckDBDataProtocol.HTTP, false);

		try {
			switch (file_type) {
				case DUCK_CONST.TYPE.TABULAR:
					await this.query(
						`CREATE OR REPLACE TABLE ${tablename} AS FROM read_csv('${filename}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`,
						{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
					);
					await this.add_row_id(tablename);
					break;
				case DUCK_CONST.TYPE.PARQUET:
					await this.query(
						`CREATE OR REPLACE TABLE ${tablename} AS FROM read_parquet('${filename}');`,
						{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
					);
					await this.add_row_id(tablename);
					break;
				case DUCK_CONST.TYPE.GEOFILE:
					await this.query(`CREATE OR REPLACE TABLE ${tablename} AS FROM ST_Read('${filename}');`, {
						format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
					});
					await this.add_row_id(tablename);
					break;
			}
			this.loaded_files.set(tablename, filename);
			return tablename;
		} catch (error) {
			console.error('Failed to read file url:', error);
			throw error;
		}
	}

	async describe_table(table: string): Promise<{ name: string[]; type: string[] }> {
		const result = (await this.query(`DESCRIBE ${table}`, {
			format: DUCK_CONST.QUERY_FORMAT.ARRAY
		})) as { column_name: string[]; column_type: string[] };
		return { name: result.column_name, type: result.column_type };
	}

	async get_row_count(table: string): Promise<number> {
		const result = (await this.query(`SELECT COUNT(*) as num_rows FROM ${table}`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		})) as ArrowTableLike;
		const row = result.get(0) as unknown as CountResult;
		return Number(row.num_rows);
	}

	async get_data(table: string, options: GetDataOptions = {}): Promise<Table> {
		let { geometry = false } = options;
		let query_end = geometry ? 'SELECT *' : `SELECT COLUMNS(c -> c NOT ILIKE '%geom%')`;
		const result = await this.query(`FROM ${table} ${query_end}`);
		return result as Table;
	}

	async sort_table(table: string, column: string, order?: string): Promise<Table> {
		const result =
			order === undefined
				? await this.query(`FROM ${table}`)
				: await this.query(`FROM ${table} ORDER BY "${column}" ${order}`);
		return result as Table;
	}

	async rename_column(table: string, old_name: string, new_name: string): Promise<void> {
		await this.query(`ALTER TABLE ${table} RENAME "${old_name}" to "${new_name}"`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
	}

	async change_column_type(table: string, column: string, new_type: string): Promise<void> {
		await this.query(
			`ALTER TABLE ${table} ALTER "${column}" SET DATA TYPE ${new_type} USING try_cast("${column}" AS ${new_type})`,
			{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
		);
	}

	async change_column_case(
		table: string,
		column: string,
		caseType: 'lower' | 'upper' = 'lower'
	): Promise<void> {
		await this.query(`UPDATE ${table} set "${column}" = ${caseType}("${column}")`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
	}

	async trim_column(table: string, column: string): Promise<void> {
		await this.query(`UPDATE ${table} set "${column}" = trim("${column}")`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
	}

	async drop_column(table: string, column: string): Promise<void> {
		await this.query(`ALTER TABLE ${table} DROP "${column}"`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
	}

	async drop_rows(table: string, rows_id: number[]): Promise<void> {
		await this.query(`DELETE FROM ${table} WHERE __id IN (${rows_id.toString()})`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
	}

	async update_cell(
		table: string,
		id_column: string,
		id_value: string | number,
		column: string,
		new_value: DuckDBValue
	): Promise<void> {
		const columns_info = await this.analyse(table);
		const column_info = columns_info.find((c) => c.name === column);
		if (!column_info) {
			throw new Error(`Column "${column}" not found in table "${table}"`);
		}

		const validationResult = validate_and_cast_value(new_value, column_info.type_js as string);
		if (!validationResult.isValid) {
			throw new Error(
				`Invalid value type for column "${column}". Expected type: ${column_info.type_js}, received: ${typeof new_value}`
			);
		}
		new_value = validationResult.value;

		let value_for_query: string | number | boolean;
		switch (typeof new_value) {
			case 'string':
				value_for_query = `'${new_value.replace(/'/g, "''")}'`;
				break;
			case 'number':
				value_for_query = new_value;
				break;
			case 'boolean':
				value_for_query = new_value ? 'TRUE' : 'FALSE';
				break;
			default:
				if (new_value instanceof Date) {
					value_for_query = `'${new_value.toISOString()}'`;
				} else if (new_value === null) {
					value_for_query = 'NULL';
				} else if (
					typeof new_value === 'string' ||
					typeof new_value === 'number' ||
					typeof new_value === 'boolean'
				) {
					value_for_query = new_value;
				} else {
					value_for_query = String(new_value);
				}
		}

		if (typeof id_value === 'string') {
			id_value = id_value.replace(/'/g, "''");
		}
		await this.query(
			`UPDATE ${table} SET "${column}" = ${value_for_query} WHERE "${id_column}" = ${id_value}`,
			{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
		);
	}

	add_filter(table: string, key_index: number, filter: string): void {
		const table_metadata = this.get_table_metadata(table);
		table_metadata.filters.set(key_index, filter);
	}

	remove_filter(table: string, key_index: number): void {
		const { filters } = this.get_table_metadata(table);
		filters.delete(key_index);
	}

	async apply_filters(table: string): Promise<Table> {
		try {
			let query = `SELECT * FROM ${table}`;
			const { filters } = this.get_table_metadata(table);
			if (filters.size > 0) {
				const filterConditions = Array.from(filters.values()).join(' AND ');
				query += ` WHERE ${filterConditions}`;
			}
			const result = await this.query(query);
			return result as Table;
		} catch (error) {
			console.error('Failed to apply filters:', error);
			throw error;
		}
	}

	async latlon_to_point(table: string, lat_column: string, lon_column: string): Promise<void> {
		await this.query(
			`CREATE OR REPLACE TABLE ${table} AS
			FROM ${table}
			SELECT
				*,
				ST_Point("${lon_column}", "${lat_column}") as geom;`,
			{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
		);
	}

	async copy_to_geoparquet_as_buffer(table: string): Promise<Uint8Array> {
		if (this.table_geoparquet_cache.has(table)) return this.table_geoparquet_cache.get(table)!;

		await this.query(`COPY ${table} TO '${table}.parquet' (COMPRESSION ZSTD);`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
		const buffer = await this.db!.copyFileToBuffer(`${table}.parquet`);

		this.table_geoparquet_cache.set(table, buffer);

		return buffer;
	}

	async export_table(
		table: string,
		format: string = DUCK_CONST.DEFAULT.FORMAT_TABULAR
	): Promise<Uint8Array> {
		const filename = table + '.' + format;
		await this.query(`COPY ${table} TO '${filename}' WITH (FORMAT '${format}')`, {
			format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
		});
		const buffer = await this.db!.copyFileToBuffer(filename);
		return buffer;
	}

	async calculate_class_breaks(
		table: string,
		column: string,
		options: CalculateBreaksOptions = {}
	): Promise<number[]> {
		let {
			method = 'quantile',
			nclass = 5,
			nclass_right = nclass,
			round = true,
			break_value = null
		} = options;

		let breaks: number[];

		if (!break_value) {
			const result = (await this.query(
				`SELECT ${method}('FROM query_table(${table}) SELECT "${column}"', "${column}", nb := ${nclass}) as breaks`,
				{ format: DUCK_CONST.QUERY_FORMAT.ARRAY }
			)) as BreaksResult[];
			breaks = result[0].breaks;
		} else {
			const break_is_inside = (await this.query(
				`FROM query_table(${table}) SELECT min("${column}") as min, max("${column}") as max, ${break_value} BETWEEN min AND max as is_inside`,
				{ format: DUCK_CONST.QUERY_FORMAT.ARRAY }
			)) as BreakInsideResult[];
			if (break_is_inside[0].is_inside === false)
				throw new Error(`break_value ${break_value.toLocaleString()} is outside the column extent`);
			const breaks_below = (await this.query(
				`SELECT ${method}('FROM query_table(${table}) SELECT "${column}" WHERE "${column}" < ${break_value}', "${column}", nb := ${nclass}) as breaks`,
				{ format: DUCK_CONST.QUERY_FORMAT.ARRAY }
			)) as BreaksResult[];
			const breaks_above = (await this.query(
				`SELECT ${method}('FROM query_table(${table}) SELECT "${column}" WHERE "${column}" >= ${break_value}', "${column}", nb := ${nclass_right}) as breaks`,
				{ format: DUCK_CONST.QUERY_FORMAT.ARRAY }
			)) as BreaksResult[];

			breaks = [...breaks_below[0].breaks, +break_value, ...breaks_above[0].breaks];
		}

		if (round) {
			const result = (await this.query(
				`SELECT round_thresholds([${breaks}], ${table}, "${column}") as breaks_rounded`,
				{ format: DUCK_CONST.QUERY_FORMAT.ARRAY }
			)) as BreaksRoundedResult[];
			const breaks_rounded = result[0].breaks_rounded;
			if (break_value) {
				const break_value_index = breaks.findIndex((d) => d === break_value);
				breaks_rounded[break_value_index] = break_value;
			}
			return breaks_rounded;
		} else {
			return breaks;
		}
	}

	async add_class(table: string, column: string, breaks: number[]): Promise<string> {
		const class_column_name = '_class_' + class_name_counter++;
		await this.query(
			`CREATE OR REPLACE TABLE ${table} AS
			 SELECT *, add_class("${column}", [${breaks}]) as ${class_column_name} FROM ${table}`
		);
		return class_column_name;
	}

	/**
	 * Analyzes the specified table and returns an array of indicators with summaries and histograms.
	 *
	 * @param {string} table - The name of the table to analyze.
	 * @param {Object} [options={}] - Optional parameters for the analysis.
	 * @param {boolean} [options.force=false] - If true, forces a re-analysis of the table, bypassing the cache.
	 * @returns {Promise<Array<Object>>} A promise that resolves to an array of indicator objects, each containing:
	 *   - {string} name - The name of the column.
	 *   - {string} type_simple - The simplified type of the column (e.g., 'numeric', 'date', 'string').
	 *   - {Object} [summary_general] - General summary statistics for the column.
	 *   - {Object} [summary_numeric] - Numeric summary statistics for the column (if applicable).
	 *   - {Object} [summary_date] - Date summary statistics for the column (if applicable).
	 *   - {Object} [histogram] - Histogram data for the column. To later generate summary plots.
	 */
	async analyse(table: string, options: AnalyseOptions = {}): Promise<AnalysisResults> {
		const { force = false } = options;
		const table_metadata = this.get_table_metadata(table);
		const { analysis } = table_metadata;

		// Check if the table has already been analyzed
		if (!force && analysis) return analysis; // Return cached results
		// force analysis => remove previous cached results
		if (force && analysis) delete table_metadata.analysis;

		const describe_full = (await this.query(`FROM describe_full('${table}')`, {
			format: DUCK_CONST.QUERY_FORMAT.ARRAY,
			useProxy: false
		})) as Record<string, unknown>[];

		const indicators = describe_full.map(async (d) => {
			let summary_general: ArrowTableLike | null = null;
			let summary_numeric: ArrowTableLike | null = null;
			let summary_date: ArrowTableLike | null = null;
			let histogram = null;
			switch (d.type_simple) {
				case 'numeric':
					summary_general = (await this.query(`FROM summary_general(${table}, "${d.name}")`, {
						useProxy: false
					})) as ArrowTableLike;
					summary_numeric = (await this.query(`FROM summary_numeric(${table}, "${d.name}")`, {
						useProxy: false
					})) as ArrowTableLike;
					histogram = await this.query(`FROM histogram_numeric(${table}, "${d.name}")`);
					break;
				case 'date':
					summary_general = (await this.query(`FROM summary_general(${table}, "${d.name}")`, {
						useProxy: false
					})) as ArrowTableLike;
					summary_date = (await this.query(`FROM summary_date(${table}, "${d.name}")`, {
						useProxy: false
					})) as ArrowTableLike;
					histogram = await this.query(`FROM histogram_numeric(${table}, "${d.name}")`);
					break;
				case 'string':
					summary_general = (await this.query(`FROM summary_general(${table}, "${d.name}")`, {
						useProxy: false
					})) as ArrowTableLike;
					histogram = await this.query(`FROM histogram_categorical(${table}, "${d.name}")`);
					break;
				//'geometry' and 'other' types are not handled
			}
			return {
				...d,
				...(summary_general?.get(0) ?? {}),
				...(summary_numeric?.get(0) ?? {}),
				...(summary_date?.get(0) ?? {}),
				histogram
			} as AnalysisResult;
		});

		const analysis_result = await Promise.all(indicators);

		// Store the analysis results in the tableMetada map
		table_metadata.analysis = analysis_result;

		return analysis_result;
	}

	/**
	 * JOINTURES
	 * - ✅ join_by_id
	 *   - ATTENTION : si basemap importé, besoin de l'analyser pour des stats à la colonne et un typage sémio.
	 *    Par défaut conserver les colonnes qui ont un typage sémio égale à 'geoid' et trié par "score" et "share_uniques".
	 * - join_by_bbox (test vers tous les fonds de carte de Khartis via Bbox)
	 * - ✅ apply_join_association (joint l'id du fond de carte sélectionné au jeu de données + la typologie de match)
	 *   /!\ L'association manuelle par l'utilisateur est gérée par la méthode update_cell
	 */

	/**
	 * Joins a table to one or multiple basemaps based on the similarity of an ID column.
	 *
	 * This method provides a unified interface for joining a table to either multiple basemaps
	 * (using `basemaps_table`) or a single basemap (using `basemap_table`, `basemap_id`, and
	 * optionally `basemap_others_id`). It uses the `apply_join_across_basemaps` macro to perform
	 * the join and then generates a synthesis of the join results using the `join_synthesis` macro.
	 *
	 * @async
	 * @param {string} table - The name of the table to join.
	 * @param {string} table_id - The name of the ID column in the table.
	 * @param {Object} options - An object containing the join options.
	 * @param {string} [options.basemaps_table] - The name of the table containing multiple basemaps.
	 * @param {string} [options.basemap_table] - The name of a single basemap table provided by the user.
	 * @param {string} [options.basemap_id] - The name of the main ID column in the single basemap table.
	 * @param {string} [options.basemap_others_id] - A comma-separated string of other ID column names in the single basemap table. Optional.
	 * @returns {Promise<Object>} - A promise that resolves to the synthesis of the join results.
	 *   - basemap: The name of the basemap.
	 *   - share_basemap: The share of the basemap in the join results.
	 *   - share_candidate: The share of the candidate in the join results.
	 * @throws {Error} - Throws an error if neither `basemaps_table` nor `basemap_table` is provided,
	 *   or if `basemap_id` is missing when `basemap_table` is used.
	 * @description This method simplifies the process of joining a table to basemaps by handling
	 *   both multiple and single basemap scenarios. It prepares the basemap table if necessary
	 *   and then performs the join, returning a synthesis of the results.
	 * @example
	 * // Example usage:
	 * await duckdb.join_by_id('my_data_table', 'my_id_column', { basemaps_table: 'khartis_basemaps' });
	 * await duckdb.join_by_id('my_data_table', 'my_id_column', { basemap_table: 'user_basemap', basemap_id: 'basemap_id', basemap_others_id: 'list_value(['other_id1', 'other_id2'])' });
	 */
	async join_by_id(
		table: string,
		table_id: string,
		options: JoinByIdOptions = {}
	): Promise<AnalysisResults> {
		const { basemaps_table, basemap_table, basemap_id, basemap_others_id } = options;

		if (!basemaps_table && !basemap_table) {
			throw new Error('Either basemaps_table or basemap_table must be provided in options.');
		}
		if (basemap_table && !basemap_id) {
			throw new Error('basemap_id must be provided when using basemap_table.');
		}
		const table_name = `${table}_join_results`;
		let basemap_join_ref_name: string | null = null;
		let join_across_query: string;

		// Case 1: Joining to multiple basemaps (using basemaps_table)
		if (basemaps_table) {
			join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${basemaps_table})`;

			// Case 2: Joining to a single basemap (using basemap_table, basemap_id, basemap_others_id)
		} else if (basemap_table) {
			basemap_join_ref_name = `${basemap_table}_join_ref`;
			// prepare the basemap table as a join reference table
			if (basemap_others_id) {
				// With alternative ID columns
				await this.query(
					`CREATE OR REPLACE TABLE ${basemap_join_ref_name} AS
					  FROM get_join_table_from_basemap(${basemap_table}, ${basemap_id}, ${basemap_others_id});`,
					{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
				);
			} else {
				// With a single ID column
				await this.query(
					`CREATE OR REPLACE TABLE ${basemap_join_ref_name} AS
					  FROM get_join_table_from_basemap(${basemap_table}, ${basemap_id})`,
					{ format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
				);
			}

			join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${basemap_join_ref_name})`;
		} else {
			throw new Error('Invalid options configuration');
		}

		// Apply the join query
		await this.query(join_across_query, { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC });
		// Generate the synthesis of the join results
		const synthesis = await this.query(`FROM join_synthesis(${table_name})`, {
			format: DUCK_CONST.QUERY_FORMAT.ARRAY
		});

		// Store association
		const table_metadata = this.get_table_metadata(table);
		table_metadata.join = {
			id: table_id,
			join_results_name: table_name,
			basemap_join_ref: basemap_join_ref_name
		};

		return synthesis as AnalysisResults;
	}

	/**
	 * Applies a join association to a table based on a previously performed join operation.
	 *
	 * This method retrieves the join association information stored during a previous join operation
	 * (either `join_by_id_to_basemaps` or `join_by_id_to_one_basemap`) and applies the join to the
	 * specified table. It adds columns from the join table to the original table, including the
	 * basemap ID and the type of match (exact, partial, etc.).
	 *
	 * @async
	 * @param {string} table - The name of the table to which the join association will be applied.
	 * @param {string} basemap - The name of the basemap to filter the join results by.
	 * @throws {Error} - Throws an error if no join association is found for the specified table.
	 */
	async apply_join_association(table: string, basemap: string): Promise<void> {
		const { join } = this.get_table_metadata(table);
		if (!join) {
			throw new Error('No join association found for the specified table');
		}
		const { id, join_results_name } = join;
		await this.query(`CREATE OR REPLACE TABLE ${table} AS
				FROM ${table} as t
				SELECT
					t.*,
					j.id as basemap_id,
					j.typo_match
				LEFT JOIN ${join_results_name} as j
				ON t.${id} = j.geoname
				WHERE j.basemap = '${basemap}'`);
	}
}

let class_name_counter = 0;
let Duck: DuckDB | null = null;

async function initDuckDB(): Promise<void> {
	Duck = new DuckDB();
	await Duck.init();
}

export { Duck, initDuckDB };
export type { DuckDB };
