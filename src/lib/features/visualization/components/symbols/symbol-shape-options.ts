import * as m from '$lib/paraglide/messages';
import {
  ShapeType,
  SymbolMode,
  availableShapesForSymbolMode
} from '$lib/features/commons/constants/visualization.constants';

const shapeLabelByType: Record<ShapeType, () => string> = {
  [ShapeType.CIRCLE]: m.shape_circle,
  [ShapeType.SQUARE]: m.shape_square,
  [ShapeType.BAR]: m.shape_bar,
  [ShapeType.SPIKE]: m.shape_spike,
  [ShapeType.CROSS]: m.shape_cross,
  [ShapeType.DIAMOND]: m.shape_diamond,
  [ShapeType.TRIANGLE]: m.shape_triangle,
  [ShapeType.STAR]: m.shape_star,
  [ShapeType.RECTANGLE]: m.shape_rectangle
};

export function getSymbolShapeTypes(symbolMode: SymbolMode): ShapeType[] {
  return availableShapesForSymbolMode(symbolMode);
}

export function buildSymbolShapeDropdownItems(
  symbolMode: SymbolMode
): Array<{ id: ShapeType; text: string }> {
  return getSymbolShapeTypes(symbolMode).map((type) => ({
    id: type,
    text: shapeLabelByType[type]()
  }));
}
