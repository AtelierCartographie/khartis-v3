let textMeasurementContext: CanvasRenderingContext2D | null | undefined;

function getTextMeasurementContext(): CanvasRenderingContext2D | null {
  if (textMeasurementContext !== undefined) return textMeasurementContext;

  if (typeof document === 'undefined') {
    textMeasurementContext = null;
    return textMeasurementContext;
  }

  const canvas = document.createElement('canvas');
  textMeasurementContext = canvas.getContext('2d');
  return textMeasurementContext;
}

function buildCanvasFont(
  fontSize: number,
  fontFamily: string,
  fontWeight: string
): string {
  return `${fontWeight} ${Number(fontSize.toFixed(3))}px ${fontFamily}`;
}

export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string
): number {
  const context = getTextMeasurementContext();
  if (context) {
    context.font = buildCanvasFont(fontSize, fontFamily, fontWeight);
    return context.measureText(text).width;
  }

  return text.length * fontSize * 0.58;
}

function splitLongWord(
  word: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const character of word) {
    const candidate = current + character;
    if (current && measure(candidate) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function wrapLine(
  line: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  if (maxWidth <= 0 || measure(line) <= maxWidth) return [line];

  const words = line.split(' ');
  const rows: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      rows.push(current);
    }

    if (measure(word) > maxWidth) {
      const chunks = splitLongWord(word, maxWidth, measure);
      rows.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? '';
    } else {
      current = word;
    }
  }

  if (current) rows.push(current);
  return rows;
}

export function computeTextLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontFamily: string,
  fontWeight: string
): string[] {
  const measure = (value: string): number =>
    measureTextWidth(value, fontSize, fontFamily, fontWeight);

  return text.split('\n').flatMap((line) => wrapLine(line, maxWidth, measure));
}
