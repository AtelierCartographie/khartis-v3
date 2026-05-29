export const ANNOTATION_ROLE = {
  TITLE: 'title',
  SUBTITLE: 'subtitle',
  SOURCE: 'source',
  BASEMAP_SOURCE: 'basemap_source',
  SIGNATURE: 'signature',
  CREDIT: 'credit',
  NOTE: 'note'
} as const;

export type AnnotationRoleValue =
  (typeof ANNOTATION_ROLE)[keyof typeof ANNOTATION_ROLE];

export const ANNOTATION_ROLES = Object.values(
  ANNOTATION_ROLE
) as readonly AnnotationRoleValue[];

export const SHAPE_TYPE = {
  CIRCLE: 'circle',
  LINE: 'line',
  RECTANGLE: 'rectangle',
  TRIANGLE: 'triangle',
  ARROW: 'arrow',
  STAR: 'star'
} as const;

export type ShapeTypeValue = (typeof SHAPE_TYPE)[keyof typeof SHAPE_TYPE];

export const SHAPE_TYPES = Object.values(
  SHAPE_TYPE
) as readonly ShapeTypeValue[];

type ShapeSpec = {
  width: number;
  height: number;
  lockAspectRatio: boolean;
};

const DEFAULT_SHAPE_SPEC: ShapeSpec = {
  width: 80,
  height: 80,
  lockAspectRatio: false
};

export const SHAPE_SPECS: Record<ShapeTypeValue, ShapeSpec> = {
  [SHAPE_TYPE.CIRCLE]: {
    width: 80,
    height: 80,
    lockAspectRatio: false
  },
  [SHAPE_TYPE.LINE]: {
    width: 120,
    height: 24,
    lockAspectRatio: false
  },
  [SHAPE_TYPE.RECTANGLE]: {
    width: 96,
    height: 72,
    lockAspectRatio: false
  },
  [SHAPE_TYPE.TRIANGLE]: {
    width: 80,
    height: 80,
    lockAspectRatio: false
  },
  [SHAPE_TYPE.ARROW]: {
    width: 120,
    height: 60,
    lockAspectRatio: true
  },
  [SHAPE_TYPE.STAR]: {
    width: 80,
    height: 80,
    lockAspectRatio: false
  }
};

export function getShapeDefaultDimensions(shapeType: string): {
  width: number;
  height: number;
} {
  const spec = SHAPE_SPECS[shapeType as ShapeTypeValue] ?? DEFAULT_SHAPE_SPEC;

  return {
    width: spec.width,
    height: spec.height
  };
}

export function isShapeAspectRatioLocked(shapeType: string): boolean {
  return (
    SHAPE_SPECS[shapeType as ShapeTypeValue]?.lockAspectRatio ??
    DEFAULT_SHAPE_SPEC.lockAspectRatio
  );
}
