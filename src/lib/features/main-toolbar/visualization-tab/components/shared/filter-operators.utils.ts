import { ColumnType } from '$lib/features/data-pipeline';
import type { VizFilterOperator } from '$lib/features/commons/store/visualization.store.svelte';
import * as m from '$lib/paraglide/messages';

export interface OperatorDef {
  value: VizFilterOperator;
  label: string;
  requiresValue?: boolean;
  requiresRange?: boolean;
  requiresLimit?: boolean;
  allowedTypes?: ColumnType[];
}

export const operators: OperatorDef[] = [
  {
    value: 'gte',
    label: m.filter_op_gte(),
    requiresValue: true,
    allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
  },
  {
    value: 'lte',
    label: m.filter_op_lte(),
    requiresValue: true,
    allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
  },
  {
    value: 'contains',
    label: m.filter_op_contains(),
    requiresValue: true,
    allowedTypes: [ColumnType.TEXT]
  },
  { value: 'equals', label: m.filter_op_equals(), requiresValue: true },
  {
    value: 'not_equals',
    label: m.filter_op_not_equals(),
    requiresValue: true
  },
  {
    value: 'between',
    label: m.filter_op_between(),
    requiresRange: true,
    allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
  },
  {
    value: 'top_asc',
    label: m.filter_op_top_asc(),
    requiresLimit: true,
    allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
  },
  {
    value: 'top_desc',
    label: m.filter_op_top_desc(),
    requiresLimit: true,
    allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
  },
  { value: 'empty', label: m.filter_op_empty() },
  { value: 'not_empty', label: m.filter_op_not_empty() }
];

export function normalizeFieldType(
  rawType: string | undefined
): ColumnType | null {
  if (!rawType) return null;
  const normalized = rawType.toLowerCase();
  if (normalized === ColumnType.NUMBER) return ColumnType.NUMBER;
  if (normalized === ColumnType.TEXT) return ColumnType.TEXT;
  if (normalized === ColumnType.DATE) return ColumnType.DATE;
  if (normalized === ColumnType.BOOLEAN) return ColumnType.BOOLEAN;
  if (
    normalized.includes('int') ||
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('numeric') ||
    normalized.includes('decimal')
  ) {
    return ColumnType.NUMBER;
  }
  if (
    normalized.includes('string') ||
    normalized.includes('varchar') ||
    normalized === 'text'
  ) {
    return ColumnType.TEXT;
  }
  if (normalized.includes('date') || normalized.includes('time')) {
    return ColumnType.DATE;
  }
  if (normalized.includes('bool')) {
    return ColumnType.BOOLEAN;
  }
  return null;
}

export function getOperatorDef(
  operatorValue: VizFilterOperator
): OperatorDef | undefined {
  return operators.find((op) => op.value === operatorValue);
}

export function getAvailableOperatorsForType(
  type: ColumnType | null
): OperatorDef[] {
  if (!type) return operators;
  return operators.filter(
    (op) => !op.allowedTypes || op.allowedTypes.includes(type)
  );
}

export function defaultOperatorForType(
  type: ColumnType | null
): VizFilterOperator {
  if (type === ColumnType.TEXT) return 'contains';
  return 'gte';
}
