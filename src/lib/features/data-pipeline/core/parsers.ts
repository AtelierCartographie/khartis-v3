import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { PipelineContext, FileFormat } from '../types';
import { isGeospatialFile, isTabularFile } from '../constants';

export class ParserError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
		public readonly fileType?: string
	) {
		super(message);
		this.name = 'ParserError';
	}
}

export interface ParseResult {
	tableName: string;
	type: 'tabular' | 'geo';
	headers: string[];
	rowCount: number;
	format: FileFormat;
}

function generateTableName(filename: string, prefix: string): string {
	const base = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
	return `${prefix}_${base}_${Date.now()}`;
}

async function cleanupTableOnError(tableName: string | undefined): Promise<void> {
	if (!tableName || !Duck) return;
	try {
		await Duck.query(`DROP TABLE IF EXISTS "${tableName}"`);
	} catch (cleanupError) {
		logger.warn('Failed to cleanup table', LogCategory.DATA, { tableName, error: cleanupError });
	}
}

function handleParserError(
	error: unknown,
	tableName: string | undefined,
	fileName: string,
	parserType: string
): never {
	if (error instanceof ParserError) {
		throw error;
	}
	logger.error(`${parserType} parsing failed`, LogCategory.DATA, { fileName, error });
	throw new ParserError(
		`Failed to parse ${parserType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
		error,
		parserType
	);
}

export async function parseTabular(
	_ctx: PipelineContext,
	file: File,
	options?: { tablename?: string }
): Promise<ParseResult> {
	const start = performance.now();
	logger.info('Parsing tabular file with DuckDB', LogCategory.DATA, {
		fileName: file.name,
		fileSize: file.size
	});

	let tableName: string | undefined;

	try {
		await initDuckDB();
		if (!Duck) {
			throw new DuckDBError('DuckDB not initialized');
		}

		tableName = options?.tablename ?? generateTableName(file.name, 'csv');
		await Duck.read_tabular(file, { tablename: tableName });

		const tableInfo = await Duck.describe_table(tableName);
		const rowCount = await Duck.get_row_count(tableName);
		const headers = tableInfo.name;

		const isTsv = file.name.toLowerCase().endsWith('.tsv');
		const format: FileFormat = isTsv ? 'csv' : 'csv';

		logger.success('Tabular file parsed successfully', LogCategory.DATA, {
			fileName: file.name,
			tableName,
			rows: rowCount,
			columns: headers.length,
			durationMs: (performance.now() - start).toFixed(2)
		});

		return { tableName, type: 'tabular', headers, rowCount, format };
	} catch (error) {
		await cleanupTableOnError(tableName);
		handleParserError(error, tableName, file.name, 'tabular');
	}
}

export async function parseGeoFile(
	_ctx: PipelineContext,
	file: File,
	options?: { tablename?: string; shapefile?: boolean }
): Promise<ParseResult> {
	const start = performance.now();
	logger.info('Parsing geo file with DuckDB', LogCategory.DATA, {
		fileName: file.name,
		fileSize: file.size
	});

	let tableName: string | undefined;

	try {
		await initDuckDB();
		if (!Duck) {
			throw new DuckDBError('DuckDB not initialized');
		}

		tableName = options?.tablename ?? generateTableName(file.name, 'geo');
		await Duck.read_geofile(file, { tablename: tableName, shapefile: options?.shapefile });

		const tableInfo = await Duck.describe_table(tableName);
		const rowCount = await Duck.get_row_count(tableName);
		const headers = tableInfo.name;

		const format = detectFileFormat(file.name);

		logger.success('Geo file parsed successfully', LogCategory.DATA, {
			fileName: file.name,
			tableName,
			rows: rowCount,
			columns: headers.length,
			durationMs: (performance.now() - start).toFixed(2)
		});

		return { tableName, type: 'geo', headers, rowCount, format };
	} catch (error) {
		await cleanupTableOnError(tableName);
		handleParserError(error, tableName, file.name, 'geo');
	}
}

export async function parseFile(
	ctx: PipelineContext,
	file: File,
	options?: { tablename?: string; companionFiles?: File[] }
): Promise<ParseResult> {
	const fileName = file.name.toLowerCase();
	const isShapefile = fileName.endsWith('.shp');

	if (!Duck) {
		await initDuckDB();
	}

	if (isShapefile && options?.companionFiles?.length) {
		const allFiles = [file, ...options.companionFiles];
		await Duck!.register_files(allFiles, { shapefile: true });
	} else if (!isShapefile) {
		await Duck!.register_files([file]);
	}

	if (isGeospatialFile(file.name)) {
		return parseGeoFile(ctx, file, { tablename: options?.tablename, shapefile: isShapefile });
	}

	if (isTabularFile(file.name)) {
		return parseTabular(ctx, file, { tablename: options?.tablename });
	}

	throw new ParserError(`Unsupported file type: ${file.name}`, undefined, 'unknown');
}

function detectFileFormat(name: string): FileFormat {
	const lower = name.toLowerCase();
	if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'csv';
	if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
	if (lower.endsWith('.shp')) return 'shapefile';
	if (lower.endsWith('.gpkg')) return 'geopackage';
	if (lower.endsWith('.kml')) return 'kml';
	if (lower.endsWith('.kmz')) return 'kmz';
	if (lower.endsWith('.geoparquet') || lower.endsWith('.parquet')) return 'geoparquet';
	return 'unknown';
}

export function canParseFile(file: File): boolean {
	return isGeospatialFile(file.name) || isTabularFile(file.name);
}
