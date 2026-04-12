/** Badge type for variable/column indicators */
export type VariableBadgeType =
  | 'geo'
  | 'geo-ref'
  | 'numeric'
  | 'boolean'
  | 'string'
  | 'date';

export interface VariableBadgeStyle {
  /** Primary text/icon color */
  color: string;
  /** Tag background color */
  bgColor: string;
  /** Tag border color */
  borderColor: string;
}

/**
 * Badge styles matching Carbon tag color tokens from the Figma design system.
 * - geo / geo-ref: Tag/Teal tokens
 * - numeric: Tag/Purple tokens
 * - string: Tag/Magenta tokens
 * - date: Tag/Blue tokens
 */
export const VARIABLE_BADGE_STYLES: Record<
  VariableBadgeType,
  VariableBadgeStyle
> = {
  geo: {
    color: '#005d5d',
    bgColor: '#9ef0f0',
    borderColor: '#08bdba'
  },
  'geo-ref': {
    color: '#005d5d',
    bgColor: '#9ef0f0',
    borderColor: '#08bdba'
  },
  numeric: {
    color: '#6929c4',
    bgColor: '#e8daff',
    borderColor: '#be95ff'
  },
  boolean: {
    color: '#004144',
    bgColor: '#a7f0ba',
    borderColor: '#42be65'
  },
  string: {
    color: '#9f1853',
    bgColor: '#ffd6e8',
    borderColor: '#ff7eb6'
  },
  date: {
    color: '#0072c3',
    bgColor: '#d0e2ff',
    borderColor: '#78a9ff'
  }
} as const;
