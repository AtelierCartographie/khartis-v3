/**
 * Annotation constants
 *
 * Annotation roles and shape types used for map annotations.
 * Centralizes all annotation-related string literals.
 */

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
