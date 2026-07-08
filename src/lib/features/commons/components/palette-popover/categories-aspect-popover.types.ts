import { ShapeType } from '$lib/features/commons/constants/visualization.constants';
import type {
  PatternParams,
  PatternShape
} from '$lib/features/commons/constants/pattern.constants';

export type CategoriesAspectVariant =
  | 'symbols-unique'
  | 'symbols-different'
  | 'symbols-different-rank'
  | 'polygons'
  | 'lines'
  | 'texts';

export interface CategoryDraft {
  id: string;
  value?: string;
  label: string;
  color: string;
  enabled: boolean;
  shape?: ShapeType;
  customSize?: number;
  strokeColor?: string;
  customStrokeWidth?: number;
  patternShape?: PatternShape;
}

export interface CategoriesCommonAspect {
  sizeUnique: boolean;
  size: number;
  stroke: boolean;
  autoColor: boolean;
  strokeSize: number;
  pattern: boolean;
  patternId?: string;
  patternParams?: PatternParams;
  patternColor?: string;
  patternColorize?: boolean;
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
  patternId: 'diagonal',
  patternParams: { size: 4, scale: 8 },
  patternColor: '#000000',
  patternColorize: false,
  shape: ShapeType.CIRCLE,
  color: '#f287ac',
  thickness: 1,
  dashed: false,
  labelSize: 12,
  fontStyle: 'regular'
};
