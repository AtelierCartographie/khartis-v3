import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export interface DecimalDetectionResult {
  separator: '.' | ',';
  confidence: number;
  sampleSize: number;
}

interface DetectionOptions {
  sampleLines?: number;
}

const EUROPEAN_DECIMAL_PATTERN = /^-?\d{1,3}(?:\s?\d{3})*,\d+$/;
const STANDARD_DECIMAL_PATTERN = /^-?\d{1,3}(?:,?\d{3})*\.\d+$/;
const QUOTED_VALUE_PATTERN = /^["'](.*)["']$/;

export async function detectDecimalSeparator(
  file: File,
  options: DetectionOptions = {}
): Promise<DecimalDetectionResult> {
  const { sampleLines = 20 } = options;

  try {
    const text = await readFileHead(file, sampleLines);
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      return { separator: '.', confidence: 0, sampleSize: 0 };
    }

    const delimiter = detectFieldDelimiter(lines[0]);

    let europeanMatches = 0;
    let standardMatches = 0;
    let totalNumericValues = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);

      for (const value of values) {
        const trimmed = unquote(value.trim());

        if (EUROPEAN_DECIMAL_PATTERN.test(trimmed)) {
          europeanMatches++;
          totalNumericValues++;
        } else if (STANDARD_DECIMAL_PATTERN.test(trimmed)) {
          standardMatches++;
          totalNumericValues++;
        }
      }
    }

    if (totalNumericValues === 0) {
      return { separator: '.', confidence: 1, sampleSize: lines.length - 1 };
    }

    const europeanRatio = europeanMatches / totalNumericValues;
    const standardRatio = standardMatches / totalNumericValues;

    if (europeanRatio > standardRatio && europeanRatio > 0.3) {
      logger.debug('European decimal format detected', LogCategory.DATA, {
        europeanMatches,
        standardMatches,
        confidence: europeanRatio
      });
      return {
        separator: ',',
        confidence: europeanRatio,
        sampleSize: lines.length - 1
      };
    }

    return {
      separator: '.',
      confidence: standardRatio || 1,
      sampleSize: lines.length - 1
    };
  } catch (error) {
    logger.warn('Failed to detect decimal separator', LogCategory.DATA, error);
    return { separator: '.', confidence: 0, sampleSize: 0 };
  }
}

function detectFieldDelimiter(headerLine: string): string {
  const delimiters = [';', ',', '\t', '|'];
  let maxCount = 0;
  let detected = ',';

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

async function readFileHead(file: File, lines: number): Promise<string> {
  const bytesToRead = Math.min(lines * 500, file.size);
  const slice = file.slice(0, bytesToRead);
  return await slice.text();
}
