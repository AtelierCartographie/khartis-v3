import type { PatternParams } from '$lib/features/commons/constants/pattern.constants';
import {
  type PatternName,
  PATTERN_TYPE_MAP,
  resolveMotifOptions,
  stripSvgDefsWrapper,
  isValidPatternId
} from '$lib/features/map/layers/pattern-texture';
import type { KhartisMotifOptions } from '$lib/features/map/layers/polygon-pattern-layer.utils';
import {
  motif,
  type PatternType as MotifPatternType
} from '@ateliercartographie/motif.js';
import {
  resolveAccessorNumber,
  resolveAccessorValue
} from './binary-attributes';
import { colorAttributes } from './layer-colors';
import { escapeXml } from './svg-color';
import { roundSvgValue, toFiniteNumber } from './svg-values';
import type { SvgColor } from './types';

interface SvgPatternDefinition {
  defsHtml: string;
  patternUrl: string;
}
export const svgPatternDefsCache = new Map<string, SvgPatternDefinition>();

function buildSvgPatternCacheKey(
  patternId: PatternName,
  params: { angle?: number; size: number; scale: number },
  fillColor: string
): string {
  return JSON.stringify({
    patternId,
    angle: params.angle,
    size: params.size,
    scale: params.scale,
    fillColor
  });
}

function generateSvgPatternDefinition(
  patternId: PatternName,
  params: { angle?: number; size: number; scale: number },
  fillColor: string
): SvgPatternDefinition | null {
  if (!PATTERN_TYPE_MAP[patternId]) return null;

  const tile = motif({
    ...resolveMotifOptions(patternId, params as PatternParams),
    fill: fillColor
  });

  return {
    defsHtml: stripSvgDefsWrapper(tile.defs.outerHTML),
    patternUrl: tile.url
  };
}

function generateSvgMotifDefinition(
  motifOptions: KhartisMotifOptions,
  fillColor: string
): SvgPatternDefinition {
  const tile = motif({
    type: motifOptions.type as MotifPatternType,
    angle: motifOptions.angle,
    scale: motifOptions.scale,
    size: motifOptions.size,
    fill: fillColor,
    background: 'transparent',
    patchSize: motifOptions.patchSize
  });

  return {
    defsHtml: stripSvgDefsWrapper(tile.defs.outerHTML),
    patternUrl: tile.url
  };
}

export function resolveSvgPatternReference(
  props: Record<string, unknown>,
  datum: unknown,
  index: number,
  fillColor: SvgColor
): SvgPatternDefinition | null {
  const patternFillColor = `rgb(${fillColor.red}, ${fillColor.green}, ${fillColor.blue})`;
  const khartisMotifOptions = props.khartisMotifOptions as
    KhartisMotifOptions | undefined;
  if (khartisMotifOptions) {
    const cacheKey = JSON.stringify({
      khartisMotifOptions,
      fillColor: patternFillColor
    });
    const cachedMotif = svgPatternDefsCache.get(cacheKey);
    if (cachedMotif) {
      return cachedMotif;
    }

    const generatedMotif = generateSvgMotifDefinition(
      khartisMotifOptions,
      patternFillColor
    );
    svgPatternDefsCache.set(cacheKey, generatedMotif);
    return generatedMotif;
  }

  const rawPatternId =
    props.khartisPatternId ??
    resolveAccessorValue(props.getFillPattern, datum, index);
  const patternId = String(rawPatternId ?? '');
  if (!isValidPatternId(patternId)) {
    return null;
  }

  const fallbackAngle = PATTERN_TYPE_MAP[patternId]?.angle;
  const size = Math.max(1, toFiniteNumber(props.khartisPatternSize, 4));
  const scale = Math.max(
    1,
    toFiniteNumber(
      props.khartisPatternScale,
      resolveAccessorNumber(props.getFillPatternScale, datum, index, 8)
    )
  );
  const angle = toFiniteNumber(
    props.khartisPatternAngle,
    resolveAccessorNumber(
      props.getFillPatternRotation,
      datum,
      index,
      fallbackAngle ?? 0
    )
  );
  const cacheKey = buildSvgPatternCacheKey(
    patternId,
    {
      angle,
      size,
      scale
    },
    patternFillColor
  );
  const cached = svgPatternDefsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const generated = generateSvgPatternDefinition(
    patternId,
    {
      angle,
      size,
      scale
    },
    patternFillColor
  );
  if (!generated) {
    return null;
  }

  svgPatternDefsCache.set(cacheKey, generated);
  return generated;
}
export function fillAttributes(
  color: SvgColor,
  pattern?: SvgPatternDefinition | null
): string {
  if (color.opacity <= 0) {
    return 'fill="none"';
  }

  if (!pattern) {
    return colorAttributes('fill', color);
  }

  return `fill="${escapeXml(pattern.patternUrl)}" fill-opacity="${roundSvgValue(color.opacity)}"`;
}
