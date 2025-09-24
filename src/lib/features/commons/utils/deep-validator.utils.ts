import { GeoColumnDetector, type GeoDetectionResult } from './geo-detector.utils';

export interface ColumnStatistics {
	name: string;
	type: 'numeric' | 'string' | 'date' | 'boolean' | 'mixed';
	nullCount: number;
	nullPercentage: number;
	uniqueCount: number;
	uniquePercentage: number;
	duplicateCount: number;
	min?: number | string | Date;
	max?: number | string | Date;
	mean?: number;
	median?: number;
	standardDeviation?: number;
	sampleValues: any[];
}

export interface DataQualityIssue {
	severity: 'error' | 'warning' | 'info';
	column?: string;
	message: string;
	affectedRows?: number[];
	suggestion?: string;
}

export interface DataAnalysisResult {
	rowCount: number;
	columnCount: number;
	columns: ColumnStatistics[];
	geoDetection: GeoDetectionResult;
	qualityIssues: DataQualityIssue[];
	performanceWarnings: string[];
	suggestions: string[];
	estimatedProcessingTime?: number;
}

export class DeepDataValidator {
	private static readonly PERFORMANCE_THRESHOLDS = {
		maxRows: 10000,
		warningRows: 5000,
		maxColumns: 100,
		warningColumns: 50,
		maxCellLength: 2000,
		maxFileSize: 50 * 1024 * 1024
	};

	private static readonly TYPE_DETECTION_SAMPLES = 100;

	static async analyzeDataContent(
		headers: string[],
		data: any[][],
		options: {
			skipGeoDetection?: boolean;
			sampleSize?: number;
		} = {}
	): Promise<DataAnalysisResult> {
		const rowCount = data.length;
		const columnCount = headers.length;

		const columns = this.analyzeColumns(headers, data);

		const geoDetection = options.skipGeoDetection
			? { hasGeoColumns: false, geoColumns: [], warnings: [] }
			: await GeoColumnDetector.detectGeoColumns(headers, data);

		const qualityIssues = this.detectQualityIssues(columns, data);

		const performanceWarnings = this.checkPerformance(rowCount, columnCount, data);

		const suggestions = this.generateSuggestions(
			columns,
			geoDetection,
			qualityIssues,
			performanceWarnings
		);

		const estimatedProcessingTime = this.estimateProcessingTime(rowCount, columnCount);

		return {
			rowCount,
			columnCount,
			columns,
			geoDetection,
			qualityIssues,
			performanceWarnings,
			suggestions,
			estimatedProcessingTime
		};
	}

	private static analyzeColumns(headers: string[], data: any[][]): ColumnStatistics[] {
		return headers.map((header, index) => {
			const columnValues = data.map(row => row[index]);
			return this.analyzeColumn(header, columnValues);
		});
	}

	private static analyzeColumn(name: string, values: any[]): ColumnStatistics {
		const nullCount = values.filter(v => v == null || v === '' || v === 'null' || v === 'NULL').length;
		const nonNullValues = values.filter(v => v != null && v !== '' && v !== 'null' && v !== 'NULL');

		const uniqueValues = new Set(nonNullValues);
		const uniqueCount = uniqueValues.size;

		const valueOccurrences = new Map<any, number>();
		nonNullValues.forEach(v => {
			valueOccurrences.set(v, (valueOccurrences.get(v) || 0) + 1);
		});
		const duplicateCount = Array.from(valueOccurrences.values()).filter(count => count > 1).length;

		const type = this.detectColumnType(nonNullValues);

		let stats: Partial<ColumnStatistics> = {
			name,
			type,
			nullCount,
			nullPercentage: (nullCount / values.length) * 100,
			uniqueCount,
			uniquePercentage: (uniqueCount / values.length) * 100,
			duplicateCount,
			sampleValues: nonNullValues.slice(0, 5)
		};

		if (type === 'numeric' && nonNullValues.length > 0) {
			const numericValues = nonNullValues
				.map(v => parseFloat(v))
				.filter(v => !isNaN(v));

			if (numericValues.length > 0) {
				stats.min = Math.min(...numericValues);
				stats.max = Math.max(...numericValues);
				stats.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
				stats.median = this.calculateMedian(numericValues);
				stats.standardDeviation = this.calculateStandardDeviation(numericValues, stats.mean);
			}
		} else if (type === 'string' && nonNullValues.length > 0) {
			const stringValues = nonNullValues.map(v => String(v));
			stats.min = stringValues.reduce((a, b) => a < b ? a : b);
			stats.max = stringValues.reduce((a, b) => a > b ? a : b);
		} else if (type === 'date' && nonNullValues.length > 0) {
			const dateValues = nonNullValues
				.map(v => new Date(v))
				.filter(d => !isNaN(d.getTime()));

			if (dateValues.length > 0) {
				const timestamps = dateValues.map(d => d.getTime());
				stats.min = new Date(Math.min(...timestamps));
				stats.max = new Date(Math.max(...timestamps));
			}
		}

		return stats as ColumnStatistics;
	}

	private static detectColumnType(values: any[]): ColumnStatistics['type'] {
		if (values.length === 0) return 'string';

		const sample = values.slice(0, this.TYPE_DETECTION_SAMPLES);

		const types = {
			numeric: 0,
			date: 0,
			boolean: 0,
			string: 0
		};

		for (const value of sample) {
			if (value == null) continue;

			const strValue = String(value).trim();

			if (strValue === 'true' || strValue === 'false' || strValue === '0' || strValue === '1') {
				types.boolean++;
			} else if (!isNaN(parseFloat(strValue)) && isFinite(parseFloat(strValue))) {
				types.numeric++;
			} else if (!isNaN(Date.parse(strValue))) {
				const date = new Date(strValue);
				if (date.getFullYear() > 1900 && date.getFullYear() < 2100) {
					types.date++;
				} else {
					types.string++;
				}
			} else {
				types.string++;
			}
		}

		const total = Object.values(types).reduce((a, b) => a + b, 0);
		if (total === 0) return 'string';

		const threshold = total * 0.8;

		if (types.numeric >= threshold) return 'numeric';
		if (types.date >= threshold) return 'date';
		if (types.boolean >= threshold) return 'boolean';
		if (types.string >= threshold) return 'string';

		return 'mixed';
	}

	private static calculateMedian(values: number[]): number {
		const sorted = values.slice().sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);

		if (sorted.length % 2 === 0) {
			return (sorted[mid - 1] + sorted[mid]) / 2;
		} else {
			return sorted[mid];
		}
	}

	private static calculateStandardDeviation(values: number[], mean: number): number {
		const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
		const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
		return Math.sqrt(avgSquaredDiff);
	}

	private static detectQualityIssues(
		columns: ColumnStatistics[],
		data: any[][]
	): DataQualityIssue[] {
		const issues: DataQualityIssue[] = [];

		columns.forEach(column => {
			if (column.nullPercentage > 50) {
				issues.push({
					severity: 'warning',
					column: column.name,
					message: `${column.nullPercentage.toFixed(1)}% de valeurs manquantes`,
					suggestion: 'Vérifiez si cette colonne est nécessaire ou complétez les données manquantes'
				});
			}

			if (column.uniquePercentage === 100 && column.type === 'string') {
				issues.push({
					severity: 'info',
					column: column.name,
					message: 'Toutes les valeurs sont uniques',
					suggestion: 'Cette colonne pourrait être un identifiant'
				});
			}

			if (column.uniqueCount === 1) {
				issues.push({
					severity: 'warning',
					column: column.name,
					message: 'Une seule valeur unique dans toute la colonne',
					suggestion: 'Cette colonne peut être supprimée car elle n\'apporte pas d\'information'
				});
			}

			if (column.type === 'numeric' && column.min !== undefined && column.max !== undefined) {
				const range = (column.max as number) - (column.min as number);
				if (range === 0) {
					issues.push({
						severity: 'warning',
						column: column.name,
						message: 'Toutes les valeurs numériques sont identiques',
						suggestion: 'Vérifiez si cette colonne est correcte'
					});
				}
			}
		});

		for (let rowIndex = 0; rowIndex < Math.min(data.length, 100); rowIndex++) {
			const row = data[rowIndex];
			for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
				const cell = row[cellIndex];
				if (typeof cell === 'string' && cell.length > this.PERFORMANCE_THRESHOLDS.maxCellLength) {
					issues.push({
						severity: 'warning',
						column: columns[cellIndex]?.name,
						message: `Cellule avec ${cell.length} caractères détectée`,
						affectedRows: [rowIndex],
						suggestion: 'Les cellules très longues peuvent affecter les performances'
					});
					break;
				}
			}
		}

		return issues;
	}

	private static checkPerformance(
		rowCount: number,
		columnCount: number,
		data: any[][]
	): string[] {
		const warnings: string[] = [];

		if (rowCount > this.PERFORMANCE_THRESHOLDS.maxRows) {
			warnings.push(
				`Fichier volumineux: ${rowCount} lignes. Le traitement sera limité aux ${this.PERFORMANCE_THRESHOLDS.maxRows} premières lignes.`
			);
		} else if (rowCount > this.PERFORMANCE_THRESHOLDS.warningRows) {
			warnings.push(
				`Fichier important: ${rowCount} lignes. Le traitement pourrait prendre du temps.`
			);
		}

		if (columnCount > this.PERFORMANCE_THRESHOLDS.maxColumns) {
			warnings.push(
				`Trop de colonnes: ${columnCount}. Maximum supporté: ${this.PERFORMANCE_THRESHOLDS.maxColumns}.`
			);
		} else if (columnCount > this.PERFORMANCE_THRESHOLDS.warningColumns) {
			warnings.push(
				`Nombreuses colonnes: ${columnCount}. Considérez de sélectionner uniquement les colonnes nécessaires.`
			);
		}

		const estimatedSize = rowCount * columnCount * 50;
		if (estimatedSize > this.PERFORMANCE_THRESHOLDS.maxFileSize) {
			warnings.push(
				'Taille estimée du fichier très importante. Considérez de diviser vos données.'
			);
		}

		return warnings;
	}

	private static generateSuggestions(
		columns: ColumnStatistics[],
		geoDetection: GeoDetectionResult,
		qualityIssues: DataQualityIssue[],
		performanceWarnings: string[]
	): string[] {
		const suggestions: string[] = [];

		if (!geoDetection.hasGeoColumns) {
			suggestions.push(
				'Aucune colonne géographique détectée. Assurez-vous d\'avoir une colonne avec des noms de lieux, codes ISO ou coordonnées.'
			);
		} else if (geoDetection.suggestedPrimaryGeoColumn) {
			const geoCol = geoDetection.suggestedPrimaryGeoColumn;
			suggestions.push(
				`Colonne géographique principale suggérée: "${geoCol.columnName}" (${geoCol.type}, confiance: ${(geoCol.confidence * 100).toFixed(0)}%)`
			);
		}

		const numericColumns = columns.filter(c => c.type === 'numeric');
		if (numericColumns.length === 0) {
			suggestions.push(
				'Aucune colonne numérique détectée. Les visualisations quantitatives nécessitent des données numériques.'
			);
		}

		const highNullColumns = columns.filter(c => c.nullPercentage > 30);
		if (highNullColumns.length > 0) {
			suggestions.push(
				`${highNullColumns.length} colonne(s) avec beaucoup de valeurs manquantes. Considérez de les exclure ou compléter.`
			);
		}

		if (performanceWarnings.length > 0) {
			suggestions.push(
				'Des problèmes de performance potentiels ont été détectés. Considérez de filtrer ou échantillonner vos données.'
			);
		}

		const severeIssues = qualityIssues.filter(i => i.severity === 'error');
		if (severeIssues.length > 0) {
			suggestions.push(
				`${severeIssues.length} problème(s) critique(s) détecté(s). Corrigez-les avant de continuer.`
			);
		}

		return suggestions;
	}

	private static estimateProcessingTime(rowCount: number, columnCount: number): number {
		const baseTime = 100;
		const rowFactor = rowCount * 0.5;
		const columnFactor = columnCount * 10;
		const complexityFactor = Math.log10(rowCount * columnCount) * 100;

		return Math.round(baseTime + rowFactor + columnFactor + complexityFactor);
	}

	static formatQualityReport(analysis: DataAnalysisResult): string {
		const lines: string[] = [];

		lines.push('=== RAPPORT D\'ANALYSE DES DONNÉES ===\n');
		lines.push(`Lignes: ${analysis.rowCount} | Colonnes: ${analysis.columnCount}`);
		lines.push(`Temps de traitement estimé: ${analysis.estimatedProcessingTime}ms\n`);

		if (analysis.geoDetection.hasGeoColumns) {
			lines.push('COLONNES GÉOGRAPHIQUES DÉTECTÉES:');
			analysis.geoDetection.geoColumns.forEach(col => {
				lines.push(`  - ${col.columnName}: ${col.type} (confiance: ${(col.confidence * 100).toFixed(0)}%)`);
			});
			lines.push('');
		}

		if (analysis.qualityIssues.length > 0) {
			lines.push('PROBLÈMES DE QUALITÉ:');
			analysis.qualityIssues.forEach(issue => {
				const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
				lines.push(`  ${icon} ${issue.message}`);
				if (issue.suggestion) {
					lines.push(`     → ${issue.suggestion}`);
				}
			});
			lines.push('');
		}

		if (analysis.suggestions.length > 0) {
			lines.push('SUGGESTIONS:');
			analysis.suggestions.forEach(suggestion => {
				lines.push(`  • ${suggestion}`);
			});
		}

		return lines.join('\n');
	}
}