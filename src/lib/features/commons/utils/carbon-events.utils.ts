export type CarbonValueEvent = Event & {
  detail?:
    | string
    | number
    | null
    | { value?: string | number | null; target?: unknown };
};

function hasReadableValue(
  target: unknown
): target is { value: string | number } {
  return (
    target !== null &&
    typeof target === 'object' &&
    'value' in target &&
    (typeof target.value === 'string' || typeof target.value === 'number')
  );
}

export function readCarbonStringValue(
  event: CarbonValueEvent,
  fallback = ''
): string {
  if (hasReadableValue(event.target)) {
    return String(event.target.value);
  }

  const detail = event.detail;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'number') return String(detail);
  if (
    detail &&
    typeof detail === 'object' &&
    'value' in detail &&
    (typeof detail.value === 'string' || typeof detail.value === 'number')
  ) {
    return String(detail.value);
  }
  if (detail && typeof detail === 'object' && hasReadableValue(detail.target)) {
    return String(detail.target.value);
  }
  return fallback;
}

export function readCarbonNumberValue(
  event: CarbonValueEvent,
  fallback = 0
): number {
  const value = Number(readCarbonStringValue(event, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}
