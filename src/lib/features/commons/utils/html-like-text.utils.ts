const HTML_TAG_DETECTION_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*?)?>/i;
const HTML_TAG_REPLACEMENT_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*?)?>/gi;
const HTML_ENTITY_DETECTION_PATTERN = /&(nbsp|amp|lt|gt|quot|#39|apos);/i;
const HTML_ENTITY_REPLACEMENT_PATTERN = /&(nbsp|amp|lt|gt|quot|#39|apos);/gi;

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'"
};

const TEXT_LIKE_COLUMN_TYPES = new Set([
  'text',
  'string',
  'varchar',
  'char',
  'character',
  'character varying'
]);

function decodeHtmlLikeEntities(value: string): string {
  return value.replace(HTML_ENTITY_REPLACEMENT_PATTERN, (entity) => {
    const decoded = HTML_ENTITY_MAP[entity.slice(1, -1).toLowerCase()];
    return decoded ?? entity;
  });
}

export function projectHtmlLikeText(value: string): string {
  if (!value) {
    return value;
  }

  const hasTags = HTML_TAG_DETECTION_PATTERN.test(value);
  const hasEntities = HTML_ENTITY_DETECTION_PATTERN.test(value);

  if (!hasTags && !hasEntities) {
    return value;
  }

  const decodedValue = hasEntities ? decodeHtmlLikeEntities(value) : value;
  const strippedValue = decodedValue.replace(HTML_TAG_REPLACEMENT_PATTERN, ' ');
  const collapsedValue = strippedValue.replace(/\s+/g, ' ').trim();

  return collapsedValue === value ? value : collapsedValue;
}

export function projectHtmlLikeValue<T>(value: T): T {
  if (typeof value !== 'string') {
    return value;
  }

  return projectHtmlLikeText(value) as T;
}

export function isTextLikeColumnType(type: string | null | undefined): boolean {
  if (!type) {
    return false;
  }

  return TEXT_LIKE_COLUMN_TYPES.has(type.trim().toLowerCase());
}
