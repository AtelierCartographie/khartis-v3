/**
 * Generates a Canvas2D texture atlas for polygon fill patterns.
 * Used by Deck.gl FillStyleExtension to render patterns on map polygons.
 *
 * Supported patterns: diagonal, horizontal, vertical, dots, cross.
 * Each pattern is rendered as a PATTERN_SIZE x PATTERN_SIZE tile in the atlas.
 */

import { LogCategory, logger } from '$lib/features/commons/utils/logger';

/** Size of each individual pattern tile in pixels */
const PATTERN_SIZE = 32;

/** All supported pattern names */
const PATTERN_NAMES = [
  'diagonal',
  'horizontal',
  'vertical',
  'dots',
  'cross'
] as const;

type PatternName = (typeof PATTERN_NAMES)[number];

/** Pattern mapping entry for FillStyleExtension */
interface PatternMappingEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cached atlas canvas + mapping to avoid regeneration */
let cachedAtlas: HTMLCanvasElement | null = null;
let cachedMapping: Record<string, PatternMappingEntry> | null = null;

function drawDiagonalPattern(
  ctx: CanvasRenderingContext2D,
  offsetX: number
): void {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;

  // Draw 45-degree diagonal lines across the tile with wrap-around
  for (let i = -PATTERN_SIZE; i < PATTERN_SIZE * 2; i += 8) {
    ctx.beginPath();
    ctx.moveTo(offsetX + i, 0);
    ctx.lineTo(offsetX + i + PATTERN_SIZE, PATTERN_SIZE);
    ctx.stroke();
  }
}

function drawHorizontalPattern(
  ctx: CanvasRenderingContext2D,
  offsetX: number
): void {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;

  for (let y = 4; y < PATTERN_SIZE; y += 8) {
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + PATTERN_SIZE, y);
    ctx.stroke();
  }
}

function drawVerticalPattern(
  ctx: CanvasRenderingContext2D,
  offsetX: number
): void {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;

  for (let x = 4; x < PATTERN_SIZE; x += 8) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x, 0);
    ctx.lineTo(offsetX + x, PATTERN_SIZE);
    ctx.stroke();
  }
}

function drawDotsPattern(ctx: CanvasRenderingContext2D, offsetX: number): void {
  ctx.fillStyle = '#000000';

  const spacing = 8;
  const radius = 2.5;

  for (let y = spacing / 2; y < PATTERN_SIZE; y += spacing) {
    for (let x = spacing / 2; x < PATTERN_SIZE; x += spacing) {
      ctx.beginPath();
      ctx.arc(offsetX + x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrossPattern(
  ctx: CanvasRenderingContext2D,
  offsetX: number
): void {
  // Cross = horizontal + vertical combined
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;

  for (let y = 4; y < PATTERN_SIZE; y += 8) {
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + PATTERN_SIZE, y);
    ctx.stroke();
  }

  for (let x = 4; x < PATTERN_SIZE; x += 8) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x, 0);
    ctx.lineTo(offsetX + x, PATTERN_SIZE);
    ctx.stroke();
  }
}

const PATTERN_DRAWERS: Record<
  PatternName,
  (ctx: CanvasRenderingContext2D, offsetX: number) => void
> = {
  diagonal: drawDiagonalPattern,
  horizontal: drawHorizontalPattern,
  vertical: drawVerticalPattern,
  dots: drawDotsPattern,
  cross: drawCrossPattern
};

/**
 * Builds the pattern texture atlas and mapping.
 * Patterns are laid out horizontally: [diagonal | horizontal | vertical | dots | cross]
 *
 * Returns the canvas element (used as fillPatternAtlas) and the mapping object.
 * Results are cached -- subsequent calls return the same references.
 */
export function getPatternAtlas(): {
  atlas: HTMLCanvasElement;
  mapping: Record<string, PatternMappingEntry>;
} {
  if (cachedAtlas && cachedMapping) {
    return { atlas: cachedAtlas, mapping: cachedMapping };
  }

  const atlasWidth = PATTERN_SIZE * PATTERN_NAMES.length;
  const atlasHeight = PATTERN_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    logger.error(
      'Failed to create 2D canvas context for pattern atlas',
      LogCategory.MAP
    );
    // Return an empty but valid result to avoid crashes
    return {
      atlas: canvas,
      mapping: {}
    };
  }

  // Fill with transparent background
  ctx.clearRect(0, 0, atlasWidth, atlasHeight);

  const mapping: Record<string, PatternMappingEntry> = {};

  PATTERN_NAMES.forEach((name, index) => {
    const offsetX = index * PATTERN_SIZE;

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, PATTERN_SIZE, PATTERN_SIZE);
    ctx.clip();

    PATTERN_DRAWERS[name](ctx, offsetX);

    ctx.restore();

    mapping[name] = {
      x: offsetX,
      y: 0,
      width: PATTERN_SIZE,
      height: PATTERN_SIZE
    };
  });

  cachedAtlas = canvas;
  cachedMapping = mapping;

  logger.info('Pattern atlas generated', LogCategory.MAP, {
    width: atlasWidth,
    height: atlasHeight,
    patterns: PATTERN_NAMES.length
  });

  return { atlas: canvas, mapping };
}

/**
 * Checks whether a given pattern ID is a valid known pattern.
 */
export function isValidPatternId(
  patternId: string | undefined
): patternId is PatternName {
  if (!patternId) return false;
  return (PATTERN_NAMES as readonly string[]).includes(patternId);
}
