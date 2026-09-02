import type {
  PrimitiveFilter,
  VizDataFilter
} from '../stores/visualization.types';

export function isVizFilterComplete(filter: VizDataFilter): boolean {
  if (filter.operator === 'empty' || filter.operator === 'not_empty') {
    return true;
  }

  if (filter.operator === 'top_asc' || filter.operator === 'top_desc') {
    const limit = filter.limit ?? Number(filter.value);
    return Number.isFinite(limit) && limit > 0;
  }

  if (String(filter.value ?? '').trim() === '') {
    return false;
  }

  return (
    filter.operator !== 'between' ||
    String(filter.secondaryValue ?? '').trim() !== ''
  );
}

export function selectVizFiltersForPrimitive(
  filters: VizDataFilter[] | undefined,
  primitive: PrimitiveFilter | undefined
): VizDataFilter[] {
  if (!filters?.length) {
    return [];
  }

  return filters.filter(
    (filter) =>
      isVizFilterComplete(filter) &&
      (!primitive ||
        !filter.primitiveType ||
        filter.primitiveType === primitive)
  );
}
