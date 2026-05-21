import { PIPELINE_CONST } from '../constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export interface DecimalDetectionResult {
  separator: '.' | ',';
  confidence: number;
  sampleSize: number;
  delimiter: string;
  thousandsSeparator?: ',' | '.' | ' ';
}

interface DetectionOptions {
  sampleLines?: number;
}

const EUROPEAN_DECIMAL_PATTERN = /^-?\d{1,3}(?:[ .]\d{3})*,\d+$/;
const STANDARD_DECIMAL_PATTERN = /^-?\d{1,3}(?:,?\d{3})*\.\d+$/;
const EUROPEAN_THOUSANDS_DOT_PATTERN = /^-?\d{1,3}(?:\.\d{3})+,\d+$/;
const EUROPEAN_THOUSANDS_SPACE_PATTERN = /^-?\d{1,3}(?: \d{3})+,\d+$/;
const STANDARD_THOUSANDS_COMMA_PATTERN = /^-?\d{1,3}(?:,\d{3})+\.\d+$/;
const INTEGER_THOUSANDS_DOT_PATTERN = /^-?\d{1,3}(?:\.\d{3})+$/;
const INTEGER_THOUSANDS_SPACE_PATTERN = /^-?\d{1,3}(?: \d{3})+$/;
const INTEGER_THOUSANDS_COMMA_PATTERN = /^-?\d{1,3}(?:,\d{3})+$/;
const QUOTED_VALUE_PATTERN = /^["'](.*)["']$/;

/**
 * Read the first N lines of a file as text. Exported so callers can share
 * a single read between decimal detection and CSV header detection.
 */
export async function readFileHead(file: File, lines: number): Promise<string> {
  const bytesToRead = Math.min(lines * 500, file.size);
  const slice = file.slice(0, bytesToRead);
  return await slice.text();
}

export async function detectDecimalSeparator(
  file: File,
  options: DetectionOptions & { cachedHead?: string } = {}
): Promise<DecimalDetectionResult> {
  const { sampleLines = 20 } = options;

  try {
    const text = options.cachedHead ?? (await readFileHead(file, sampleLines));
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      return { separator: '.', confidence: 0, sampleSize: 0, delimiter: ',' };
    }

    const delimiter = detectFieldDelimiter(lines[0]);

    let europeanMatches = 0;
    let standardMatches = 0;
    let totalNumericValues = 0;
    let europeanThousandsDotMatches = 0;
    let europeanThousandsSpaceMatches = 0;
    let standardThousandsCommaMatches = 0;
    let integerThousandsDotMatches = 0;
    let integerThousandsSpaceMatches = 0;
    let integerThousandsCommaMatches = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);

      for (const value of values) {
        const trimmed = unquote(value.trim());

        if (EUROPEAN_DECIMAL_PATTERN.test(trimmed)) {
          europeanMatches++;
          totalNumericValues++;
          if (EUROPEAN_THOUSANDS_DOT_PATTERN.test(trimmed)) {
            europeanThousandsDotMatches++;
          } else if (EUROPEAN_THOUSANDS_SPACE_PATTERN.test(trimmed)) {
            europeanThousandsSpaceMatches++;
          }
        } else if (STANDARD_DECIMAL_PATTERN.test(trimmed)) {
          standardMatches++;
          totalNumericValues++;
          if (STANDARD_THOUSANDS_COMMA_PATTERN.test(trimmed)) {
            standardThousandsCommaMatches++;
          }
        } else if (INTEGER_THOUSANDS_DOT_PATTERN.test(trimmed)) {
          integerThousandsDotMatches++;
        } else if (INTEGER_THOUSANDS_SPACE_PATTERN.test(trimmed)) {
          integerThousandsSpaceMatches++;
        } else if (INTEGER_THOUSANDS_COMMA_PATTERN.test(trimmed)) {
          integerThousandsCommaMatches++;
        }
      }
    }

    if (totalNumericValues === 0) {
      const integerThousandsMatches =
        integerThousandsDotMatches +
        integerThousandsSpaceMatches +
        integerThousandsCommaMatches;

      if (integerThousandsMatches > 0) {
        const integerThousandsCandidates: Array<{
          separator: ',' | '.' | ' ';
          count: number;
        }> = [
          { separator: '.', count: integerThousandsDotMatches },
          { separator: ' ', count: integerThousandsSpaceMatches },
          { separator: ',', count: integerThousandsCommaMatches }
        ];
        const dominantThousands = integerThousandsCandidates.sort(
          (left, right) => right.count - left.count
        )[0];

        return {
          separator: '.',
          confidence: dominantThousands.count / integerThousandsMatches,
          sampleSize: lines.length - 1,
          delimiter,
          thousandsSeparator: dominantThousands.separator
        };
      }

      return {
        separator: '.',
        confidence: 1,
        sampleSize: lines.length - 1,
        delimiter
      };
    }

    const europeanRatio = europeanMatches / totalNumericValues;
    const standardRatio = standardMatches / totalNumericValues;

    if (europeanRatio > standardRatio && europeanRatio > 0.3) {
      let thousandsSeparator: ',' | '.' | ' ' | undefined;
      const hasMixedDecimalFormats = standardMatches > 0;

      if (!hasMixedDecimalFormats) {
        if (europeanThousandsDotMatches >= europeanThousandsSpaceMatches) {
          thousandsSeparator =
            europeanThousandsDotMatches > 0 ? '.' : undefined;
        } else {
          thousandsSeparator =
            europeanThousandsSpaceMatches > 0 ? ' ' : undefined;
        }
      }
      return {
        separator: ',',
        confidence: europeanRatio,
        sampleSize: lines.length - 1,
        delimiter,
        thousandsSeparator
      };
    }

    const hasMixedDecimalFormats = europeanMatches > 0;

    return {
      separator: '.',
      confidence: standardRatio || 1,
      sampleSize: lines.length - 1,
      delimiter,
      thousandsSeparator:
        !hasMixedDecimalFormats && standardThousandsCommaMatches > 0
          ? ','
          : undefined
    };
  } catch (error) {
    logger.error('Failed to detect decimal format', LogCategory.DATA, error);
    return { separator: '.', confidence: 0, sampleSize: 0, delimiter: ',' };
  }
}

function detectFieldDelimiter(headerLine: string): string {
  const delimiters = PIPELINE_CONST.CSV.SUPPORTED_DELIMITERS;
  let maxCount = 0;
  let detected: string = PIPELINE_CONST.CSV.DEFAULT_DELIMITER;

  for (const d of delimiters) {
    const escapedDelimiter = d === '|' ? '\\|' : d;
    const count = (headerLine.match(new RegExp(escapedDelimiter, 'g')) || [])
      .length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }

  return detected;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

function unquote(value: string): string {
  const match = value.match(QUOTED_VALUE_PATTERN);
  return match ? match[1] : value;
}
