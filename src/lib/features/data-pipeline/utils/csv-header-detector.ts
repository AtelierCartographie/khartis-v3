import { readFileHead } from './decimal-detector';
import { parseCsvLine, unquoteCsvValue } from './csv-line-parser';

interface DetectionOptions {
  sampleLines?: number;
  similarityThreshold?: number;
}

type CellCategory = 'numeric' | 'text' | 'empty';

export interface CsvHeaderDetectionResult {
  hasHeader: boolean;
  confidence: number;
  comparedColumns: number;
}

const NUMERIC_PATTERN =
  /^[-+]?(?:(?:\d+)|(?:\d*\.\d+)|(?:\d*,\d+)|(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?)|(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?))(?:[eE][-+]?\d+)?$/;

export async function detectCsvHeader(
  file: File,
  delimiter: string,
  options: DetectionOptions & { cachedHead?: string } = {}
): Promise<CsvHeaderDetectionResult> {
  const { sampleLines = 5, similarityThreshold = 0.8 } = options;
  const text = options.cachedHead ?? (await readFileHead(file, sampleLines));
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      hasHeader: true,
      confidence: 0,
      comparedColumns: 0
    };
  }

  const firstRow = parseCsvLine(lines[0], delimiter).map(classifyCell);
  const secondRow = parseCsvLine(lines[1], delimiter).map(classifyCell);

  if (
    firstRow.length === 0 ||
    secondRow.length === 0 ||
    firstRow.length !== secondRow.length
  ) {
    return {
      hasHeader: true,
      confidence: 0,
      comparedColumns: Math.min(firstRow.length, secondRow.length)
    };
  }

  let sameCategoryCount = 0;
  for (let i = 0; i < firstRow.length; i++) {
    if (firstRow[i] === secondRow[i]) {
      sameCategoryCount++;
    }
  }

  const similarity = sameCategoryCount / firstRow.length;
  const firstRowNumericCount = firstRow.filter(
    (category) => category === 'numeric'
  ).length;
  const secondRowNumericCount = secondRow.filter(
    (category) => category === 'numeric'
  ).length;

  const firstRowAllNumericOrEmpty = firstRow.every(
    (category) => category === 'numeric' || category === 'empty'
  );
  const hasHeader =
    !firstRowAllNumericOrEmpty ||
    !(
      similarity >= similarityThreshold &&
      firstRowNumericCount > 0 &&
      secondRowNumericCount > 0
    );

  return {
    hasHeader,
    confidence: hasHeader ? 1 - similarity : similarity,
    comparedColumns: firstRow.length
  };
}

function classifyCell(value: string): CellCategory {
  const unquoted = unquoteCsvValue(value).trim();
  if (!unquoted) {
    return 'empty';
  }

  const compact = unquoted.replace(/\s+/g, '');
  const normalized =
    compact.startsWith('(') && compact.endsWith(')')
      ? `-${compact.slice(1, -1)}`
      : compact;

  return NUMERIC_PATTERN.test(normalized) ? 'numeric' : 'text';
}
