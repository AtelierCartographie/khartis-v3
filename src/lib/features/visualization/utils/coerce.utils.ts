import {
  MissingDataShape,
  ShapeType
} from '$lib/features/commons/constants/visualization.constants';

export function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const MISSING_DATA_SHAPES = new Set<string>(Object.values(MissingDataShape));

export function coerceMissingDataShape(
  value: unknown
): MissingDataShape | undefined {
  if (typeof value !== 'string') return undefined;
  return MISSING_DATA_SHAPES.has(value)
    ? (value as MissingDataShape)
    : undefined;
}

const SHAPE_TYPES = new Set<string>(Object.values(ShapeType));

export function coerceShapeType(value: unknown): ShapeType | undefined {
  if (typeof value !== 'string') return undefined;
  return SHAPE_TYPES.has(value) ? (value as ShapeType) : undefined;
}

export function parseOpacityToSlider(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined) {
    return fallback;
  }
  return value <= 1 ? Math.round(value * 100) : value;
}
