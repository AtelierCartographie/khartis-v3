import type { UiDensity } from '$lib/features/commons/stores/ui-density.store.svelte';

export interface ColumnInfo {
  name: string;
  type: string;
}

export type TableRow = Record<string, unknown>;

export type SortOrder = 'ASC' | 'DESC' | null;

export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export type TableMutation =
  | {
      type: 'refine';
      columnName: string;
      operation: string;
    }
  | {
      type: 'rename';
      oldName: string;
      newName: string;
    }
  | {
      type: 'type_change';
      columnName: string;
      newType: ColumnType;
    }
  | {
      type: 'delete';
      columnName: string;
    };

export const TABLE_ROW_HEIGHT = {
  comfortable: 32,
  compact: 24
} as const satisfies Record<UiDensity, number>;
export const DOM_UPDATE_DELAY_MS = 50;
