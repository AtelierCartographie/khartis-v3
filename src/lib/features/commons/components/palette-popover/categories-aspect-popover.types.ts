import type { ShapeType } from '$lib/features/main-toolbar/constants';

export type CategoriesAspectVariant =
  | 'symbols-unique'
  | 'symbols-different'
  | 'symbols-different-rank'
  | 'polygons'
  | 'lines'
  | 'texts';

export interface CategoryDraft {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
  shape?: ShapeType;
}

export interface CategoriesCommonAspect {
  sizeUnique: boolean;
  size: number;
  stroke: boolean;
  autoColor: boolean;
  strokeSize: number;
  pattern: boolean;
  thickness?: number;
  dashed?: boolean;
  labelSize?: number;
  fontStyle?: 'regular' | 'bold' | 'italic';
}

export const DEFAULT_COMMON_ASPECT: CategoriesCommonAspect = {
  sizeUnique: true,
  size: 2,
  stroke: true,
  autoColor: true,
  strokeSize: 1,
  pattern: false,
  thickness: 1,
  dashed: false,
  labelSize: 12,
  fontStyle: 'regular'
};
