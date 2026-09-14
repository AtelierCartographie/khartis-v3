// Bang Wong, « Points of view: Color blindness », Nature Methods 8, 441 (2011).
// Wong's black is dropped: Khartis proposes categories of comparable visual
// weight, and black outranks every other hue of the series.
export const WONG_COLORS = [
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7'
] as const;

// Paul Tol, « Colour Schemes » (SRON/EPS-TN-09-002), jeu qualitatif « muted ».
export const TOL_MUTED_COLORS = [
  '#cc6677',
  '#332288',
  '#ddcc77',
  '#117733',
  '#88ccee',
  '#882255',
  '#44aa99',
  '#999933',
  '#aa4499'
] as const;

export const COLORBLIND_SEQUENTIAL_SEEDS = {
  blue: '#0072b2',
  vermilion: '#d55e00',
  green: '#117733',
  indigo: '#332288'
} as const;

// Tol PRGn and BuRd endpoints, plus the Wong vermilion / Tol indigo pair.
export const COLORBLIND_DIVERGING_PAIRS = {
  prgn: ['#762a83', '#1b7837'],
  burd: ['#2166ac', '#b2182b'],
  orin: ['#d55e00', '#332288']
} as const;
