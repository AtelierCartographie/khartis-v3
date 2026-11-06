import type { ClassPattern } from '$lib/features/commons/services/pattern-palette.service';
import { MM_PER_CSS_PX, type QmlSymbolLayer, type Rgba } from './qml';

// motif.js draws each motif in a tile of `scale × 10` page pixels, covering
// `size` % of it, the tile turned by `angle` clockwise (y points down).
const TILE_BASE_SIZE = 10;

function hexToRgba(hex: string): Rgba {
  const value = hex.replace('#', '');
  const channel = (index: number) =>
    parseInt(value.slice(index, index + 2), 16) || 0;
  return [channel(0), channel(2), channel(4), 255];
}

export interface QgisPattern {
  layers: QmlSymbolLayer[];
  /** The QGIS marker only resembles the motif (plus, cross). */
  approximate: boolean;
}

/**
 * The QGIS fill layers that redraw a motif.js pattern: hatching for lines
 * and plaid, a marker grid for dots and shapes. Null when QGIS has nothing
 * like it (dithering, custom motifs).
 */
export function resolveQgisPattern(pattern: ClassPattern): QgisPattern | null {
  const tile = Math.max(1, pattern.scale * TILE_BASE_SIZE);
  const area = (Math.min(100, Math.max(0, pattern.size)) / 100) * tile * tile;
  const color = hexToRgba(pattern.fill);
  const distanceMm = tile * MM_PER_CSS_PX;
  // A QGIS pattern turns counter-clockwise, motif.js and a QGIS marker
  // clockwise.
  const angle = -pattern.angle;
  const markerAngle = pattern.angle;
  const hatch = (lineAngle: number, widthPx: number): QmlSymbolLayer => ({
    kind: 'line-pattern',
    angle: lineAngle,
    distanceMm,
    lineWidthMm: widthPx * MM_PER_CSS_PX,
    color
  });
  const grid = (
    shape: string,
    sizePx: number,
    rotation?: number
  ): QmlSymbolLayer => ({
    kind: 'point-pattern',
    angle,
    distanceMm,
    marker: {
      shape,
      sizeMm: sizePx * MM_PER_CSS_PX,
      color,
      angle: rotation
    }
  });

  switch (pattern.type) {
    case 'line':
      return { layers: [hatch(angle, area / tile)], approximate: false };
    case 'plaid': {
      const width = tile - Math.sqrt(Math.max(0, tile * tile - area));
      return {
        layers: [hatch(angle, width), hatch(angle + 90, width)],
        approximate: false
      };
    }
    case 'circle':
      return {
        layers: [grid('circle', 2 * Math.sqrt(area / Math.PI))],
        approximate: false
      };
    case 'square':
      return {
        layers: [grid('square', Math.sqrt(area), markerAngle)],
        approximate: false
      };
    case 'diamond':
      // A square turned 45°: QGIS sizes a diamond by its diagonal.
      return {
        layers: [grid('diamond', Math.sqrt(area) * Math.SQRT2, markerAngle)],
        approximate: false
      };
    case 'triangle':
      // Equilateral, circumradius 2·√(A / 3√3); QGIS takes the diameter.
      return {
        layers: [
          grid(
            'equilateral_triangle',
            4 * Math.sqrt(area / (3 * Math.sqrt(3))),
            markerAngle
          )
        ],
        approximate: false
      };
    case 'plus':
    case 'cross':
      return {
        layers: [
          grid(
            'cross_fill',
            Math.sqrt((16 * area) / 7),
            pattern.type === 'cross' ? markerAngle + 45 : markerAngle
          )
        ],
        approximate: true
      };
    default:
      return null;
  }
}
