import { ShapeType } from '$lib/features/main-toolbar/constants';

export type CategoriesAspectVariant =
  | 'symbols-unique'
  | 'symbols-different'
  | 'symbols-different-rank'
  | 'polygons'
  | 'lines'
  | 'texts';

export enum PatternType {
  DOTS = 'dots',
  LINES = 'lines',
  CROSSHATCH = 'crosshatch',
  DASHES = 'dashes'
}

export interface CategoryDraft {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
  shape?: ShapeType;
  customSize?: number;
  strokeColor?: string;
  customStrokeWidth?: number;
}

export interface CategoriesCommonAspect {
  sizeUnique: boolean;
  size: number;
  stroke: boolean;
  autoColor: boolean;
  strokeSize: number;
  pattern: boolean;
  patternType?: PatternType;
  strokeUnique?: boolean;
  shape?: ShapeType;
  color?: string;
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
  strokeUnique: true,
  strokeSize: 1,
  pattern: false,
  patternType: PatternType.DOTS,
  shape: ShapeType.CIRCLE,
  color: '#f287ac',
  thickness: 1,
  dashed: false,
  labelSize: 12,
  fontStyle: 'regular'
};
