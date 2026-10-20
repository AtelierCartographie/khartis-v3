const ORPHAN_MAX_CHARACTERS = 3;

interface LabelPiece {
  text: string;
  /** What joins the piece to the previous one when they share a line. */
  joiner: '' | ' ';
}

// Break opportunities, in a typographer's order: spaces, then right after a
// hyphen, which stays at the end of the line. A word is never cut.
function splitPieces(paragraph: string): LabelPiece[] {
  return paragraph
    .split(/ +/)
    .filter((word) => word.length > 0)
    .flatMap((word, wordIndex) =>
      (word.match(/[^-]+-+|[^-]+$|-+/g) ?? [word]).map((text, index) => ({
        text,
        joiner: index === 0 && wordIndex > 0 ? (' ' as const) : ('' as const)
      }))
    );
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  const lines: string[] = [];
  let current = '';

  for (const piece of splitPieces(paragraph)) {
    const candidate = current
      ? current + piece.joiner + piece.text
      : piece.text;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = piece.text;
  }
  if (current) lines.push(current);

  // A last line of a few letters reads as a stray fragment: the line above
  // takes it and runs a little wider than the limit instead.
  const last = lines[lines.length - 1];
  if (lines.length > 1 && last.length <= ORPHAN_MAX_CHARACTERS) {
    const previous = lines[lines.length - 2];
    const joiner = previous.endsWith('-') ? '' : ' ';
    lines.splice(-2, 2, previous + joiner + last);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Lines of a label wrapped to `maxWidth`, breaking at spaces or after a
 * hyphen, never inside a word. Explicit line breaks are kept.
 */
export function wrapLabelText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  return text
    .split('\n')
    .flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}
