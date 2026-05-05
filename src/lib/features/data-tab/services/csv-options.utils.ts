export type ThousandsSeparatorSelectValue = 'none' | 'space' | ',' | '.';

export function toThousandsSeparatorSelectValue(
  separator: string | undefined
): ThousandsSeparatorSelectValue {
  if (separator === ' ') {
    return 'space';
  }
  if (separator === ',' || separator === '.') {
    return separator;
  }
  return 'none';
}

export function fromThousandsSeparatorSelectValue(
  value: string
): string | undefined {
  if (value === 'none') {
    return undefined;
  }
  if (value === 'space') {
    return ' ';
  }
  if (value === ',' || value === '.') {
    return value;
  }
  return undefined;
}

export function canUseThousandsSeparator(
  value: ThousandsSeparatorSelectValue,
  decimalSeparator: string
): boolean {
  const separator = fromThousandsSeparatorSelectValue(value);
  return separator == null || separator !== decimalSeparator;
}
