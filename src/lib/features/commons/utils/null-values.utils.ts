import { NULL_VALUE_TOKENS } from '../constants/detection.constants';

const NULL_VALUE_TOKEN_SET = new Set<string>(NULL_VALUE_TOKENS);

export function isConfiguredNullValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  return typeof value === 'string' && NULL_VALUE_TOKEN_SET.has(value.trim());
}
