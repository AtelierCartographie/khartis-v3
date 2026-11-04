import {
  colorblindDivergingPalettes,
  colorblindSequentialPalettes,
  divergingPalettes,
  findPaletteById,
  monochromePalettes,
  PALETTE_TYPE,
  sepiaPalettes,
  sequentialPalettes
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { ClassificationMethod } from '$lib/features/commons/stores/visualization.types';
import { ToolbarStep } from '$lib/features/commons/types/global';
import { DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX } from '$lib/features/commons/utils/discretization.utils';
import { COUNTS_MISLEAD_IN_CHOROPLETH } from './map-review';
import {
  invalidInput,
  isRecord,
  type ColumnNature,
  type Parsed
} from './types';

// Manual bounds and calendar steps depend on the data, which the agent does
// not see: it picks among the methods the engine computes on its own.
export const AGENT_CLASSIFICATION_METHODS = [
  ClassificationMethod.QUANTILES,
  ClassificationMethod.EQUAL_INTERVAL,
  ClassificationMethod.KMEANS,
  ClassificationMethod.Q6,
  ClassificationMethod.NESTED_MEANS,
  ClassificationMethod.HEAD_TAIL
] as const;

export type AgentClassificationMethod =
  (typeof AGENT_CLASSIFICATION_METHODS)[number];

export const AGENT_CLASS_COUNT = {
  min: 2,
  max: DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
} as const;

export const AGENT_STEPS = [
  ToolbarStep.Data,
  ToolbarStep.Visualizations,
  ToolbarStep.Styling
] as const;

export const AGENT_TEXT_LIMITS = {
  title: 200,
  subtitle: 300,
  source: 500,
  note: 500
} as const;

const CLASS_PALETTE_TYPES = new Set<string>([
  PALETTE_TYPE.SEQUENTIAL,
  PALETTE_TYPE.DIVERGING
]);

// Control characters, and the bidirectional overrides that can make a text
// display differently from what it holds.
const CONTROL_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

export interface ClassificationChange {
  visualizationId: string;
  method?: AgentClassificationMethod;
  classes?: number;
  paletteId?: string;
  inverted?: boolean;
}

export interface LayoutTextsChange {
  title?: string;
  subtitle?: string;
  source?: string;
}

export interface LegendTextsChange {
  legendId: string;
  title?: string;
  subtitle?: string;
  note?: string;
}

export interface TextChange {
  textId: string;
  text: string;
}

export interface StepChange {
  step: (typeof AGENT_STEPS)[number];
}

export interface ChoroplethVariableChange {
  visualizationId: string;
  column: string;
}

export interface SuggestionsQuery {
  datasetId?: string;
}

export interface SuggestionChoice extends SuggestionsQuery {
  suggestionKey: string;
}

/** The fields of an input object, which holds no other field. */
function parseFields(
  input: unknown,
  allowed: readonly string[]
): Parsed<Record<string, unknown>> {
  if (!isRecord(input)) return invalidInput('Expected an object.');
  const unexpected = Object.keys(input).find((key) => !allowed.includes(key));
  if (unexpected) return invalidInput(`Unexpected field: ${unexpected}.`);
  return { ok: true, value: input };
}

function parseIdentifier(value: unknown, field: string): Parsed<string> {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    return invalidInput(`${field} must be a non-empty string id.`);
  }
  return { ok: true, value };
}

function parseText(
  value: unknown,
  field: string,
  maxLength: number
): Parsed<string> {
  if (typeof value !== 'string') {
    return invalidInput(`${field} must be a string.`);
  }
  if (value.length > maxLength) {
    return invalidInput(`${field} must be at most ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return invalidInput(`${field} must not contain control characters.`);
  }
  return { ok: true, value };
}

function listClassPaletteIds(): {
  sequential: string[];
  diverging: string[];
} {
  const sequential = new Set<string>();
  const diverging = new Set<string>();
  for (const palette of [
    ...sequentialPalettes,
    ...colorblindSequentialPalettes,
    ...monochromePalettes,
    ...sepiaPalettes,
    ...divergingPalettes,
    ...colorblindDivergingPalettes
  ]) {
    const resolved = findPaletteById(palette.id);
    if (resolved?.id !== palette.id) continue;
    if (resolved.type === PALETTE_TYPE.SEQUENTIAL) sequential.add(palette.id);
    if (resolved.type === PALETTE_TYPE.DIVERGING) diverging.add(palette.id);
  }
  return { sequential: [...sequential], diverging: [...diverging] };
}

/** Palette ids a classed fill accepts: sequential or diverging ramps. */
export const CLASS_PALETTE_IDS = listClassPaletteIds();

export function parseUpdateClassificationInput(
  raw: unknown
): Parsed<ClassificationChange> {
  const checked = parseFields(raw, [
    'visualization_id',
    'method',
    'classes',
    'palette_id',
    'inverted'
  ]);
  if (!checked.ok) return checked;
  const input = checked.value;

  const id = parseIdentifier(input.visualization_id, 'visualization_id');
  if (!id.ok) return id;
  const change: ClassificationChange = { visualizationId: id.value };

  if (input.method !== undefined) {
    const method = AGENT_CLASSIFICATION_METHODS.find(
      (candidate) => candidate === input.method
    );
    if (!method) {
      return invalidInput(
        `method must be one of ${AGENT_CLASSIFICATION_METHODS.join(', ')}.`
      );
    }
    change.method = method;
  }

  if (input.classes !== undefined) {
    const classes = input.classes;
    if (
      typeof classes !== 'number' ||
      !Number.isInteger(classes) ||
      classes < AGENT_CLASS_COUNT.min ||
      classes > AGENT_CLASS_COUNT.max
    ) {
      return invalidInput(
        `classes must be an integer from ${AGENT_CLASS_COUNT.min} to ${AGENT_CLASS_COUNT.max}.`
      );
    }
    change.classes = classes;
  }

  if (input.palette_id !== undefined) {
    const paletteId = input.palette_id;
    const palette =
      typeof paletteId === 'string' ? findPaletteById(paletteId) : undefined;
    if (!palette || !CLASS_PALETTE_TYPES.has(palette.type)) {
      return invalidInput(
        'palette_id must be a sequential or diverging palette listed by inspect_project.'
      );
    }
    change.paletteId = palette.id;
  }

  if (input.inverted !== undefined) {
    if (typeof input.inverted !== 'boolean') {
      return invalidInput('inverted must be a boolean.');
    }
    change.inverted = input.inverted;
  }

  if (Object.keys(change).length === 1) {
    return invalidInput(
      'Give at least one of method, classes, palette_id, inverted.'
    );
  }
  return { ok: true, value: change };
}

export function parseLayoutTextsInput(raw: unknown): Parsed<LayoutTextsChange> {
  const fields = ['title', 'subtitle', 'source'] as const;
  const checked = parseFields(raw, fields);
  if (!checked.ok) return checked;
  const input = checked.value;

  const change: LayoutTextsChange = {};
  for (const field of fields) {
    if (input[field] === undefined) continue;
    const text = parseText(input[field], field, AGENT_TEXT_LIMITS[field]);
    if (!text.ok) return text;
    change[field] = text.value;
  }

  if (Object.keys(change).length === 0) {
    return invalidInput('Give at least one of title, subtitle, source.');
  }
  return { ok: true, value: change };
}

export function parseLegendTextsInput(raw: unknown): Parsed<LegendTextsChange> {
  const fields = ['title', 'subtitle', 'note'] as const;
  const checked = parseFields(raw, ['legend_id', ...fields]);
  if (!checked.ok) return checked;
  const input = checked.value;

  const id = parseIdentifier(input.legend_id, 'legend_id');
  if (!id.ok) return id;
  const change: LegendTextsChange = { legendId: id.value };
  for (const field of fields) {
    if (input[field] === undefined) continue;
    const text = parseText(input[field], field, AGENT_TEXT_LIMITS[field]);
    if (!text.ok) return text;
    change[field] = text.value;
  }

  if (Object.keys(change).length === 1) {
    return invalidInput('Give at least one of title, subtitle, note.');
  }
  return { ok: true, value: change };
}

export function parseSetTextInput(raw: unknown): Parsed<TextChange> {
  const checked = parseFields(raw, ['text_id', 'text']);
  if (!checked.ok) return checked;
  const input = checked.value;
  const id = parseIdentifier(input.text_id, 'text_id');
  if (!id.ok) return id;
  const text = parseText(input.text, 'text', AGENT_TEXT_LIMITS.note);
  if (!text.ok) return text;
  return { ok: true, value: { textId: id.value, text: text.value } };
}

export function parseGoToStepInput(raw: unknown): Parsed<StepChange> {
  const checked = parseFields(raw, ['step']);
  if (!checked.ok) return checked;
  const input = checked.value;
  const step = AGENT_STEPS.find((candidate) => candidate === input.step);
  if (!step) {
    return invalidInput(`step must be one of ${AGENT_STEPS.join(', ')}.`);
  }
  return { ok: true, value: { step } };
}

function parseOptionalDatasetId(
  input: Record<string, unknown>
): Parsed<SuggestionsQuery> {
  if (input.dataset_id === undefined) return { ok: true, value: {} };
  const id = parseIdentifier(input.dataset_id, 'dataset_id');
  return id.ok ? { ok: true, value: { datasetId: id.value } } : id;
}

export function parseSuggestVisualizationsInput(
  raw: unknown
): Parsed<SuggestionsQuery> {
  const checked = parseFields(raw, ['dataset_id']);
  return checked.ok ? parseOptionalDatasetId(checked.value) : checked;
}

export function parseApplySuggestionInput(
  raw: unknown
): Parsed<SuggestionChoice> {
  const checked = parseFields(raw, ['dataset_id', 'suggestion_key']);
  if (!checked.ok) return checked;
  const input = checked.value;
  const dataset = parseOptionalDatasetId(input);
  if (!dataset.ok) return dataset;
  const key = input.suggestion_key;
  if (typeof key !== 'string' || key.trim() === '' || key.length > 2000) {
    return invalidInput(
      'suggestion_key must be a key returned by suggest_visualizations.'
    );
  }
  return { ok: true, value: { ...dataset.value, suggestionKey: key } };
}

export function parseSetChoroplethVariableInput(
  raw: unknown
): Parsed<ChoroplethVariableChange> {
  const checked = parseFields(raw, ['visualization_id', 'column']);
  if (!checked.ok) return checked;
  const input = checked.value;
  const id = parseIdentifier(input.visualization_id, 'visualization_id');
  if (!id.ok) return id;
  const column = parseIdentifier(input.column, 'column');
  if (!column.ok) return column;
  return {
    ok: true,
    value: { visualizationId: id.value, column: column.value }
  };
}

/**
 * Why a column cannot drive a choropleth, or null when it can: a choropleth
 * classes a ratio. A calculated column the engine has not typed is allowed,
 * the classes computation then decides.
 */
export function refuseForChoropleth(
  nature: ColumnNature | undefined
): string | null {
  switch (nature) {
    case 'count':
      return `is a count: ${COUNTS_MISLEAD_IN_CHOROPLETH}. Apply the proportional symbols suggestion, or map a ratio such as a rate or a density.`;
    case 'category':
    case 'ordered_category':
    case 'label':
    case 'place_id':
      return 'holds categories or names, not numbers to class.';
    case 'latitude':
    case 'longitude':
      return 'holds coordinates, not a variable to map.';
    default:
      return null;
  }
}
