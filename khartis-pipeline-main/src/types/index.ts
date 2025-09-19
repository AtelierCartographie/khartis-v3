export type GeometryType = 'point' | 'line' | 'polygon';

export interface Dataset {
	tablename: string;
	filename: string;
	columns?: ColumnInfo[];
}

export interface ColumnInfo {
	name: string;
	type: string;
	type_js: string;
	type_semio?: string;
	score?: number;
}

export interface UIState {
	selected_dataset: string;
	current_page: string;
	loading: boolean;
}

export interface VisualizationCriteria {
	id: string;
	label_fr: string;
	nb_column: number;
	type_semio: string[];
	geometry: GeometryType[];
	columns?: string[];
}

// Types pour la base de données DuckDB
export type DuckDBValue = string | number | boolean | Date | null | ArrayBuffer | Uint8Array;

export interface DuckDBColumn {
	name: string;
	type: string;
	type_js: string;
}

export interface DuckDBMetadata {
	name: string;
	format: string;
	nb_entities: number;
	geometry: string;
	crs: string;
}

export interface TableData {
	tablename: string;
	filename: string;
	columns: DuckDBColumn[];
	analysis?: AnalysisResults | null;
}

export interface AnalysisResult {
	name: string;
	type_simple: 'numeric' | 'date' | 'string';
	min?: number | Date;
	max?: number | Date;
	histogram?: unknown; // Sera typé plus précisément selon le contexte
	uniques?: number;
	nulls?: number;
	count?: number;
	[key: string]: unknown; // Pour les propriétés additionnelles du summary
}

export type AnalysisResults = AnalysisResult[];

export interface ValidationResult<T = DuckDBValue> {
	isValid: boolean;
	value: T;
}

// Types pour les options de requête
export interface QueryResult<T = unknown> {
	data: T[];
	columns: DuckDBColumn[];
}

// Types pour les functions utilitaires
export type TableName = string;
export type ColumnName = string;
export type SQLQuery = string;

// Types pour les gestionnaires DuckDB
export interface DuckDBBindings {
	[key: string]: unknown;
}

export interface DuckDBConnection {
	useUnsafe<T>(callback: (bindings: DuckDBBindings, conn: unknown) => Promise<T>): Promise<T>;
}

// Types pour les résultats de requêtes DuckDB
export interface ArrowTableLike {
	get(index: number): Record<string, unknown>;
	numRows: number;
	toArray(): Record<string, unknown>[];
}

export interface TableDescribeResult {
	column_name: string;
	column_type: string;
}

export interface CountResult {
	num_rows: number;
}

// Types pour les algorithmes de breaks
export interface BreaksResult {
	breaks: number[];
}

export interface BreaksRoundedResult {
	breaks_rounded: number[];
}

export interface BreakInsideResult {
	is_inside: boolean;
}
