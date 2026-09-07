import {
  SHAPE_CATEGORY_VIZ_IDS,
  type SemioType,
  type VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import {
  CATEGORY_SHAPE_CYCLE,
  SHAPE_ORDINAL,
  ShapeType
} from '$lib/features/commons/constants/visualization.constants';
import {
  DEFAULT_QUALITATIVE_PREVIEW,
  DEFAULT_SEQUENTIAL_PREVIEW,
  ORDERED_CATEGORY_PALETTE_ID,
  findPaletteById
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { VIF_MIXTE_COLORS } from '$lib/features/commons/constants/qualitative-palette.constants';
import {
  DEFAULT_VISUALIZATION_COLOR,
  DEFAULT_VISUALIZATION_SECONDARY_COLOR,
  DEFAULT_STROKE_COLOR
} from '$lib/features/commons/constants/colors.constants';

export const VIZ_PREVIEW_SIZE = 120;

export type VizPreviewShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      opacity?: number;
    }
  | {
      kind: 'path';
      d: string;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      value: string;
      fontSize: number;
      fill: string;
      halo: string;
    };

// Couleurs dépendantes du thème : exposées en variables CSS pour que le thème
// sombre soit résolu par la feuille de style et non recalculé en JS. Les couleurs
// de données restent des hex littéraux — ce sont les palettes de l'application.
const TOKEN = {
  canvas: 'var(--kh-preview-canvas)',
  neutral: 'var(--kh-preview-neutral)',
  seam: 'var(--kh-preview-seam)',
  ink: 'var(--kh-preview-ink)',
  tick: 'var(--kh-preview-tick)'
} as const;

const CHANNEL = {
  NONE: 'none',
  VALUE: 'value',
  HUE: 'hue',
  ORDERED: 'ordered'
} as const;

type Channel = (typeof CHANNEL)[keyof typeof CHANNEL];

interface PreviewComposition {
  primitive: 'symbols' | 'polygons' | 'lines' | 'texts';
  onPolygons: boolean;
  sized: boolean;
  doubleSized: boolean;
  colour: Channel;
  shaped: Channel;
  labelled: boolean;
}

function resolvePrimitive(
  suggestion: VizSuggestion
): PreviewComposition['primitive'] {
  if (suggestion.id.startsWith('texts_')) return 'texts';
  const geometries = suggestion.geometries ?? [];
  if (geometries.includes('point')) return 'symbols';
  if (geometries.includes('line')) return 'lines';
  return 'polygons';
}

// La composition est lue dans `semioTypes` / `geometries`, jamais dans la chaîne
// `id` : renommer une suggestion ne doit pas pouvoir changer son dessin.
export function readComposition(suggestion: VizSuggestion): PreviewComposition {
  const primitive = resolvePrimitive(suggestion);
  const semioTypes = suggestion.semioTypes ?? [];
  // Pour `texts_*`, la première colonne porte l'étiquette elle-même ; ce sont les
  // suivantes qui portent l'encodage, comme dans buildDisplayRows() de la carte.
  const encoding: SemioType[] =
    primitive === 'texts' ? semioTypes.slice(1) : semioTypes;

  const categorical = encoding.find((type) => type === 'QL' || type === 'QLO');
  const usesShape = SHAPE_CATEGORY_VIZ_IDS.has(suggestion.id);

  let colour: Channel = CHANNEL.NONE;
  if (encoding.includes('QTR')) colour = CHANNEL.VALUE;
  else if (categorical === 'QL') colour = CHANNEL.HUE;
  else if (categorical === 'QLO') colour = CHANNEL.ORDERED;

  return {
    primitive,
    onPolygons: suggestion.dataGeometry === 'polygon',
    sized: encoding.includes('QTA'),
    doubleSized: encoding.filter((type) => type === 'QTA').length === 2,
    colour: usesShape ? CHANNEL.NONE : colour,
    shaped: usesShape ? colour : CHANNEL.NONE,
    labelled: encoding.includes('label')
  };
}

/* -------------------------------------------------------------- palettes -- */

const CLASS_COUNT = 5;

function toRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

function toHex(channels: number[]): string {
  return `#${channels
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

function blend(from: string, to: string, amount: number): string {
  const a = toRgb(from);
  const b = toRgb(to);
  return toHex(a.map((value, i) => value + (b[i] - value) * amount));
}

// DEFAULT_SEQUENTIAL_PREVIEW ne donne que 4 paliers ; une rampe lue à 118 px en
// demande au moins 5 pour ne pas se lire « deux couleurs ». On ré-échantillonne
// la rampe de l'application au lieu d'en inventer une autre.
function sequentialSteps(count: number): string[] {
  const stops = DEFAULT_SEQUENTIAL_PREVIEW.map(toRgb);
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * (stops.length - 1);
    const low = Math.floor(t);
    const high = Math.min(stops.length - 1, low + 1);
    const ratio = t - low;
    return toHex(
      stops[low].map((value, k) => value + (stops[high][k] - value) * ratio)
    );
  });
}

// Catégories ordonnées (QLO) : les bornes de la palette que la suggestion applique
// désormais à la carte, pour que la vignette ne promette rien d'autre que le rendu.
// L'interpolation est linéaire ici, perceptuelle (OKLab) dans ok-palette : l'écart
// sur les paliers intermédiaires est invisible à 118 px, et une vignette n'a pas à
// tirer le moteur de palettes — ni son OffscreenCanvas — dans chaque carte.
const ORDERED_STOPS =
  findPaletteById(ORDERED_CATEGORY_PALETTE_ID)?.colors ??
  DEFAULT_SEQUENTIAL_PREVIEW;

function orderedSteps(count: number): string[] {
  const start = ORDERED_STOPS[0];
  const end = ORDERED_STOPS[ORDERED_STOPS.length - 1];
  return Array.from({ length: count }, (_, i) =>
    blend(start, end, i / (count - 1))
  );
}

/* ------------------------------------------------------------- substrats -- */

const LATTICE_COLUMNS = 4;
const LATTICE_ROWS = 3;
// Décalages fixes des sommets intérieurs : la trame est partagée, donc deux
// mailles voisines réutilisent exactement les mêmes points — ni trou ni recouvrement.
const VERTEX_OFFSETS: [number, number][] = [
  [0, 0],
  [6, -5],
  [-5, 4],
  [4, 6],
  [0, 0],
  [0, 0],
  [-6, 5],
  [7, -4],
  [-4, -6],
  [0, 0],
  [0, 0],
  [5, 6],
  [-6, -5],
  [6, 4],
  [0, 0],
  [0, 0],
  [-4, -6],
  [4, 5],
  [-6, 4],
  [0, 0]
];

function vertex(row: number, column: number): [number, number] {
  const x = -8 + column * ((VIZ_PREVIEW_SIZE + 16) / LATTICE_COLUMNS);
  const y = -8 + row * ((VIZ_PREVIEW_SIZE + 16) / LATTICE_ROWS);
  const onEdge =
    row === 0 ||
    row === LATTICE_ROWS ||
    column === 0 ||
    column === LATTICE_COLUMNS;
  if (onEdge) return [x, y];
  const [dx, dy] = VERTEX_OFFSETS[row * (LATTICE_COLUMNS + 1) + column];
  return [x + dx, y + dy];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

interface LatticeCell {
  d: string;
  centroid: [number, number];
}

const LATTICE: LatticeCell[] = (() => {
  const cells: LatticeCell[] = [];
  for (let row = 0; row < LATTICE_ROWS; row += 1) {
    for (let column = 0; column < LATTICE_COLUMNS; column += 1) {
      const corners = [
        vertex(row, column),
        vertex(row, column + 1),
        vertex(row + 1, column + 1),
        vertex(row + 1, column)
      ];
      cells.push({
        d: `M${corners.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`,
        centroid: [
          corners.reduce((sum, [x]) => sum + x, 0) / corners.length,
          corners.reduce((sum, [, y]) => sum + y, 0) / corners.length
        ]
      });
    }
  }
  return cells;
})();

const CLOUD: [number, number][] = [
  [24, 26],
  [63, 20],
  [96, 34],
  [40, 52],
  [82, 62],
  [21, 79],
  [58, 88],
  [99, 92]
];

const NETWORK = [
  'M-6 88 C22 62 34 84 60 58 C78 41 92 44 126 22',
  'M-6 34 C24 30 40 52 60 58',
  'M60 58 C70 78 86 84 126 78',
  'M22 -6 C30 26 20 52 -6 62',
  'M92 -6 C86 26 96 44 92 62 C88 84 104 100 96 126'
];

// Formes de toponymes sans mot réel : la vignette montre une texture typographique,
// elle n'a rien à traduire.
const PLACE_NAMES = ['Ambry', 'Vella', 'Sorre', 'Naret'];

// Les 12 mailles classées du clair au foncé le long d'une diagonale : les extrêmes
// se touchent au centre, seule façon de lire un ordre sans balayage du regard.
const SEQUENTIAL_ORDER = [0, 1, 4, 2, 5, 8, 3, 6, 9, 7, 10, 11];

// Affectation catégorielle non monotone, où la teinte 1 revient sur deux mailles
// non adjacentes. Une rampe ne peut pas se répéter : cette répétition est le signal
// qui sépare chaque vignette QL de sa voisine QTR.
const CATEGORY_ORDER = [2, 0, 1, 3, 1, 4, 0, 2, 3, 1, 4, 0];

// Rayons en rapport d'aire 1:2:4:8:16 — la seule lecture honnête d'un symbole
// proportionnel — posés sur des emplacements qui rendent les extrêmes voisins.
const GRADUATED_RADII = [4, 5.7, 8, 11.3, 16];
const GRADUATED_SLOTS = [5, 1, 7, 3, 4];
const UNIFORM_SLOTS = [0, 1, 2, 3, 4, 5, 6];
const LINE_WIDTHS = [1.2, 2.4, 4, 6.4, 9];
const LINE_WIDTH_ORDER = [4, 1, 3, 0, 2];
const UNIFORM_LINE_WIDTH = 3;
const UNIFORM_SYMBOL_RADIUS = 6;
const SHAPE_RADIUS = 9.5;
const NOMINAL_SHAPES = [
  CATEGORY_SHAPE_CYCLE[0],
  CATEGORY_SHAPE_CYCLE[1],
  CATEGORY_SHAPE_CYCLE[2],
  CATEGORY_SHAPE_CYCLE[3],
  CATEGORY_SHAPE_CYCLE[0]
];
const ORDERED_SHAPES = [...CATEGORY_SHAPE_CYCLE]
  .slice(0, 5)
  .sort((a, b) => SHAPE_ORDINAL[a] - SHAPE_ORDINAL[b]);
const SHAPE_SLOTS_SCATTERED = [0, 1, 3, 4, 6];
const SHAPE_SLOTS_RANKED = [0, 3, 6, 4, 2];
// Décorrélation volontaire : le plus gros symbole reçoit une classe claire, le plus
// petit une classe foncée. Deux canaux corrélés se liraient comme une seule variable.
const DECORRELATED_CLASSES = [4, 0, 2, 3, 1, 4, 0];
// Un glyphe n'a pas d'aplat pour se défendre : la classe la plus claire, lisible sur
// une maille, disparaîtrait sur le fond de la vignette.
const TEXT_CLASSES = [4, 1, 3, 2];
const TEXT_SIZES = [12, 14.5, 17, 19.5];
const TEXT_SIZE_ORDER = [3, 0, 2, 1];
const UNIFORM_TEXT_SIZE = 13;
const LABEL_SIZE = 12;

/* ---------------------------------------------------------------- dessin -- */

const LABEL_FLOOR = VIZ_PREVIEW_SIZE - 4;

function shapePath(
  shape: ShapeType,
  cx: number,
  cy: number,
  r: number
): string {
  // Silhouettes calibrées à aire perçue égale : des boîtes englobantes identiques
  // feraient lire un carré comme « plus grand » qu'un disque, donc comme du proportionnel.
  switch (shape) {
    case ShapeType.SQUARE: {
      const side = r * 1.772;
      return `M${round(cx - side / 2)} ${round(cy - side / 2)}h${round(side)}v${round(side)}h${round(-side)}Z`;
    }
    case ShapeType.TRIANGLE: {
      const side = r * 2.69;
      const height = (side * Math.sqrt(3)) / 2;
      return `M${round(cx)} ${round(cy - (2 * height) / 3)}L${round(cx + side / 2)} ${round(cy + height / 3)}L${round(cx - side / 2)} ${round(cy + height / 3)}Z`;
    }
    case ShapeType.DIAMOND: {
      const half = r * 1.253;
      return `M${round(cx)} ${round(cy - half)}L${round(cx + half)} ${round(cy)}L${round(cx)} ${round(cy + half)}L${round(cx - half)} ${round(cy)}Z`;
    }
    case ShapeType.CROSS: {
      const arm = r * 0.72;
      const reach = r * 1.55;
      return `M${round(cx - arm)} ${round(cy - reach)}h${round(2 * arm)}v${round(reach - arm)}h${round(reach - arm)}v${round(2 * arm)}h${round(-(reach - arm))}v${round(reach - arm)}h${round(-2 * arm)}v${round(-(reach - arm))}h${round(-(reach - arm))}v${round(-2 * arm)}h${round(reach - arm)}Z`;
    }
    default:
      return `M${round(cx)} ${round(cy)}m${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Une étiquette rognée par le bord de la vignette se lit comme un défaut : on
// estime son encombrement et on ramène l'ancre dans le cadre.
function placeLabel(
  x: number,
  y: number,
  value: string,
  fontSize: number,
  fill: string
): VizPreviewShape {
  const halfWidth = (value.length * fontSize * 0.58) / 2;
  return {
    kind: 'text',
    x: round(clamp(x, halfWidth + 4, VIZ_PREVIEW_SIZE - halfWidth - 4)),
    y: round(clamp(y, fontSize + 2, LABEL_FLOOR - fontSize * 0.25)),
    value,
    fontSize,
    fill,
    halo: TOKEN.canvas
  };
}

function cellFills(composition: PreviewComposition): string[] {
  if (
    composition.colour === CHANNEL.VALUE ||
    composition.colour === CHANNEL.ORDERED
  ) {
    const steps =
      composition.colour === CHANNEL.VALUE
        ? sequentialSteps(CLASS_COUNT)
        : orderedSteps(CLASS_COUNT);
    const fills = new Array<string>(LATTICE.length);
    SEQUENTIAL_ORDER.forEach((cellIndex, position) => {
      fills[cellIndex] =
        steps[
          Math.min(
            CLASS_COUNT - 1,
            Math.floor((position / LATTICE.length) * CLASS_COUNT)
          )
        ];
    });
    return fills;
  }
  if (composition.colour === CHANNEL.HUE) {
    return CATEGORY_ORDER.map((index) => VIF_MIXTE_COLORS[index]);
  }
  return LATTICE.map(() => DEFAULT_VISUALIZATION_COLOR);
}

function lattice(fills: string[], opacity?: number): VizPreviewShape[] {
  return LATTICE.map((cell, index) => ({
    kind: 'path' as const,
    d: cell.d,
    fill: fills[index],
    stroke: TOKEN.seam,
    strokeWidth: 1,
    ...(opacity === undefined ? {} : { opacity })
  }));
}

function markColours(
  composition: PreviewComposition,
  count: number,
  classOrder: number[] = DECORRELATED_CLASSES
): string[] | null {
  if (composition.colour === CHANNEL.VALUE) {
    const steps = sequentialSteps(CLASS_COUNT);
    return Array.from(
      { length: count },
      (_, i) => steps[classOrder[i % classOrder.length]]
    );
  }
  if (composition.colour === CHANNEL.ORDERED) {
    const steps = orderedSteps(CLASS_COUNT);
    return Array.from(
      { length: count },
      (_, i) => steps[classOrder[i % classOrder.length]]
    );
  }
  if (composition.colour === CHANNEL.HUE) {
    const order = [2, 0, 1, 3, 1, 4, 0];
    return Array.from(
      { length: count },
      (_, i) =>
        DEFAULT_QUALITATIVE_PREVIEW[
          order[i % order.length] % DEFAULT_QUALITATIVE_PREVIEW.length
        ]
    );
  }
  return null;
}

interface Mark {
  x: number;
  y: number;
  r: number;
  shape: ShapeType;
  fill: string;
  innerRadius: number;
}

function symbolMarks(
  composition: PreviewComposition,
  backdropCarriesColour: boolean
): Mark[] {
  if (composition.shaped !== CHANNEL.NONE) {
    const ordered = composition.shaped === CHANNEL.ORDERED;
    // Nominal (CategoryShapeMode.DIFFERENT) : formes du cycle, avec une forme
    // répétée sur deux emplacements non voisins — une série ordonnée ne se répète pas.
    // Ordonné (CategoryShapeMode.ORDERED) : formes rangées par SHAPE_ORDINAL et
    // posées de gauche à droite, pour que le rang se lise dans l'espace.
    const shapes = ordered ? ORDERED_SHAPES : NOMINAL_SHAPES;
    const slots = ordered ? SHAPE_SLOTS_RANKED : SHAPE_SLOTS_SCATTERED;
    return slots.map((slot, i) => ({
      x: CLOUD[slot][0],
      y: CLOUD[slot][1],
      r: SHAPE_RADIUS,
      shape: shapes[i % shapes.length],
      fill: DEFAULT_VISUALIZATION_COLOR,
      innerRadius: 0
    }));
  }

  if (composition.sized) {
    const colours = backdropCarriesColour
      ? null
      : markColours(composition, GRADUATED_RADII.length);
    return GRADUATED_SLOTS.map((slot, i) => ({
      x: CLOUD[slot][0],
      y: CLOUD[slot][1],
      r: GRADUATED_RADII[i],
      shape: ShapeType.CIRCLE,
      fill: colours ? colours[i] : DEFAULT_VISUALIZATION_COLOR,
      innerRadius: composition.doubleSized
        ? GRADUATED_RADII[(i + 3) % GRADUATED_RADII.length] * 0.62
        : 0
    }));
  }

  const colours = backdropCarriesColour
    ? null
    : markColours(composition, UNIFORM_SLOTS.length);
  return UNIFORM_SLOTS.map((slot, i) => ({
    x: CLOUD[slot][0],
    y: CLOUD[slot][1],
    r: UNIFORM_SYMBOL_RADIUS,
    shape: ShapeType.CIRCLE,
    fill: colours ? colours[i] : DEFAULT_VISUALIZATION_COLOR,
    innerRadius: 0
  }));
}

function drawSymbols(composition: PreviewComposition): VizPreviewShape[] {
  // Sur une donnée polygonale, ce sont les mailles qui portent la couleur
  // (« fond en classes » du libellé) et le symbole ne garde que la taille.
  const backdropCarriesColour =
    composition.onPolygons && composition.colour !== CHANNEL.NONE;
  const shapes: VizPreviewShape[] = backdropCarriesColour
    ? lattice(cellFills(composition))
    : lattice(LATTICE.map(() => TOKEN.neutral));

  const marks = symbolMarks(composition, backdropCarriesColour);
  marks.forEach((mark) => {
    shapes.push({
      kind: 'path',
      d: shapePath(mark.shape, mark.x, mark.y, mark.r),
      fill: mark.fill,
      stroke: DEFAULT_STROKE_COLOR,
      strokeWidth: 1
    });
    if (mark.innerRadius) {
      shapes.push({
        kind: 'circle',
        cx: mark.x,
        cy: mark.y,
        r: round(mark.innerRadius),
        fill: DEFAULT_VISUALIZATION_SECONDARY_COLOR,
        stroke: DEFAULT_STROKE_COLOR,
        strokeWidth: 1
      });
    }
  });

  if (composition.labelled) {
    [...marks]
      .sort((a, b) => b.r - a.r)
      .slice(0, 2)
      .forEach((mark, i) => {
        shapes.push(
          placeLabel(
            mark.x,
            mark.y - mark.r - 3,
            PLACE_NAMES[i],
            LABEL_SIZE,
            TOKEN.ink
          )
        );
      });
  }

  return shapes;
}

function drawPolygons(composition: PreviewComposition): VizPreviewShape[] {
  const shapes = lattice(cellFills(composition));
  if (composition.labelled) {
    // Les étiquettes « top 10 » se posent sur des valeurs hautes, mais sur deux
    // mailles en diagonale : alignées, elles se liraient comme une légende en pied.
    [SEQUENTIAL_ORDER[10], SEQUENTIAL_ORDER[9]].forEach((cellIndex, i) => {
      const [cx, cy] = LATTICE[cellIndex].centroid;
      shapes.push(
        placeLabel(cx, cy + 4, PLACE_NAMES[i], LABEL_SIZE, TOKEN.ink)
      );
    });
  }
  return shapes;
}

function drawLines(composition: PreviewComposition): VizPreviewShape[] {
  const shapes = lattice(
    LATTICE.map(() => TOKEN.neutral),
    0.45
  );
  const colours = markColours(composition, NETWORK.length);
  NETWORK.forEach((d, i) => {
    shapes.push({
      kind: 'path',
      d,
      fill: 'none',
      stroke: colours ? colours[i] : DEFAULT_VISUALIZATION_COLOR,
      strokeWidth: composition.sized
        ? LINE_WIDTHS[LINE_WIDTH_ORDER[i]]
        : UNIFORM_LINE_WIDTH
    });
  });
  return shapes;
}

function drawTexts(composition: PreviewComposition): VizPreviewShape[] {
  const shapes = lattice(
    LATTICE.map(() => TOKEN.neutral),
    0.45
  );
  const colours = markColours(composition, PLACE_NAMES.length, TEXT_CLASSES);
  [0, 2, 3, 6].forEach((slot, i) => {
    const [x, y] = CLOUD[slot];
    const fontSize = composition.sized
      ? TEXT_SIZES[TEXT_SIZE_ORDER[i]]
      : UNIFORM_TEXT_SIZE;
    const fill = colours ? colours[i] : TOKEN.ink;
    shapes.push({ kind: 'circle', cx: x, cy: y + 4, r: 1.6, fill: TOKEN.tick });
    shapes.push(placeLabel(x, y, PLACE_NAMES[i], fontSize, fill));
  });
  return shapes;
}

export function buildVizPreview(suggestion: VizSuggestion): VizPreviewShape[] {
  const composition = readComposition(suggestion);

  const fragment =
    composition.primitive === 'polygons'
      ? drawPolygons(composition)
      : composition.primitive === 'lines'
        ? drawLines(composition)
        : composition.primitive === 'texts'
          ? drawTexts(composition)
          : drawSymbols(composition);

  return [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      width: VIZ_PREVIEW_SIZE,
      height: VIZ_PREVIEW_SIZE,
      fill: TOKEN.canvas
    },
    ...fragment
  ];
}
