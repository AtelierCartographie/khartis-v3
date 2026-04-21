export const VIF_MIXTE_COLORS = [
  '#f287ac',
  '#00ad92',
  '#c39800',
  '#90a8ff',
  '#da5e04'
] as const;

export const VIF_CHAUD_COLORS = [
  '#bb98ff',
  '#dd5642',
  '#db6fb5',
  '#e2a333',
  '#b75dce'
] as const;

export const VIF_FROID_COLORS = [
  '#aabf4c',
  '#00a5cc',
  '#2dbd86',
  '#77b1ff',
  '#51a738'
] as const;

export const PASTEL_MIXTE_COLORS = [
  '#fbd0dd',
  '#a9e8dd',
  '#ecd79e',
  '#cdd6ff',
  '#f6c7a8'
] as const;

export const PASTEL_CHAUD_COLORS = [
  '#dfcefe',
  '#f3bfb2',
  '#f3c6e1',
  '#f3dab1',
  '#e7c3f0'
] as const;

export const PASTEL_FROID_COLORS = [
  '#dde5b0',
  '#a9dfed',
  '#bfe7d4',
  '#c8def9',
  '#c5e2b9'
] as const;

export const SEPIA_MIXTE_COLORS = [
  '#b08c7a',
  '#9f8a6a',
  '#bf9c55',
  '#a79279',
  '#b58268'
] as const;

export const SEPIA_CHAUD_COLORS = [
  '#9e8d81',
  '#c7856e',
  '#b08575',
  '#c29a6d',
  '#a38273'
] as const;

export const SEPIA_FROID_COLORS = [
  '#a89874',
  '#87918c',
  '#94957e',
  '#8a8e7c',
  '#9c9478'
] as const;

export const GRAYSCALE_COLORS = [
  '#d9d9d9',
  '#bdbdbd',
  '#a3a3a3',
  '#7a7a7a',
  '#525252'
] as const;

export const DEFAULT_QUALITATIVE_PRESET = 'vif' as const;

export const VIF_ALL_COLORS = [
  ...VIF_MIXTE_COLORS,
  ...VIF_CHAUD_COLORS,
  ...VIF_FROID_COLORS
] as const;

export const PASTEL_ALL_COLORS = [
  ...PASTEL_MIXTE_COLORS,
  ...PASTEL_CHAUD_COLORS,
  ...PASTEL_FROID_COLORS
] as const;

export const SEPIA_ALL_COLORS = [
  ...SEPIA_MIXTE_COLORS,
  ...SEPIA_CHAUD_COLORS,
  ...SEPIA_FROID_COLORS
] as const;

export const DEFAULT_CATEGORICAL_COLORS = [...VIF_ALL_COLORS];
