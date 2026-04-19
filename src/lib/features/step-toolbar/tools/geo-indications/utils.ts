export type ColorPickerValidateEvent = {
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
};

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
