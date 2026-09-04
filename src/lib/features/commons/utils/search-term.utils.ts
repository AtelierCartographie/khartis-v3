const GROUPING_CHARACTERS = /[\s\u00a0\u202f']/g;
const NUMERIC_TERM_PATTERN =
  /^[+-]?[\d\s\u00a0\u202f'.,]*\d[\d\s\u00a0\u202f'.,]*$/;

/**
 * Numbers are stored canonically (dot decimal, no grouping) but displayed
 * locale-formatted, so a typed term has to be brought back to the stored form
 * before it can match. Returns null when the term is not numeric at all.
 */
export function toCanonicalNumericTerm(term: string): string | null {
  const trimmed = term.trim();
  if (!NUMERIC_TERM_PATTERN.test(trimmed)) {
    return null;
  }

  const withoutGrouping = trimmed.replace(GROUPING_CHARACTERS, '');
  const commaCount = (withoutGrouping.match(/,/g) ?? []).length;

  if (commaCount === 1 && !withoutGrouping.includes('.')) {
    return withoutGrouping.replace(',', '.');
  }

  return withoutGrouping.replace(/,/g, '');
}
