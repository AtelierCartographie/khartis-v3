import {
  DistanceUnit,
  InsetMapType
} from '$lib/features/commons/constants/ui.constants';

export type ColorPickerValidateEvent = {
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
};

export const INSET_MAP_SIZE_LIMITS: Record<
  InsetMapType,
  { min: number; max: number }
> = {
  [InsetMapType.GLOBE]: {
    min: 20,
    max: 800
  },
  [InsetMapType.PLANISPHERE]: {
    min: 20,
    max: 800
  }
};

const METERS_PER_KILOMETER = 1000;
const METERS_PER_MILE = 1609.344;
const EARTH_CIRCUMFERENCE_KILOMETERS = 40075.017;

export const MAX_SCALE_DISTANCE_BY_UNIT: Record<DistanceUnit, number> = {
  [DistanceUnit.KILOMETERS]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS),
  [DistanceUnit.MILES]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS / 1.609344)
};

export function clampScaleDistance(
  distance: number,
  unit: DistanceUnit,
  fallback: number
): number {
  const candidate = Number.isFinite(distance) ? distance : fallback;
  return Math.max(0, Math.min(MAX_SCALE_DISTANCE_BY_UNIT[unit], candidate));
}

export function toDistanceMeters(distance: number, unit: DistanceUnit): number {
  return unit === DistanceUnit.KILOMETERS
    ? distance * METERS_PER_KILOMETER
    : distance * METERS_PER_MILE;
}

export function fromDistanceMeters(
  distanceMeters: number,
  unit: DistanceUnit
): number {
  return unit === DistanceUnit.KILOMETERS
    ? distanceMeters / METERS_PER_KILOMETER
    : distanceMeters / METERS_PER_MILE;
}

export function convertDistanceValue(
  distance: number,
  fromUnit: DistanceUnit,
  toUnit: DistanceUnit
): number {
  if (!Number.isFinite(distance) || distance <= 0 || fromUnit === toUnit) {
    return distance;
  }

  return fromDistanceMeters(toDistanceMeters(distance, fromUnit), toUnit);
}

export function getNumericEventValue(event: Event, fallback: number): number {
  const customEvent = event as CustomEvent<unknown>;
  const detail = customEvent.detail;

  if (typeof detail === 'number' && Number.isFinite(detail)) {
    return detail;
  }

  if (typeof detail === 'string') {
    const parsed = Number(detail);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (detail && typeof detail === 'object' && 'value' in detail) {
    const rawValue = (detail as { value: unknown }).value;
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const targetValue = Number(
    (event.currentTarget as HTMLInputElement | null)?.value
  );
  if (Number.isFinite(targetValue)) {
    return targetValue;
  }

  return fallback;
}
