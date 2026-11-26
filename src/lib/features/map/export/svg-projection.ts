import { readBinaryNumber, readBinaryTuple } from './binary-attributes';
import {
  getLayerId,
  getLayerProps,
  getLayerTypeName,
  resolveDeckLayerNameLabel
} from './deck-layers';
import { escapeXml } from './svg-color';
import {
  type SvgIdDeduper,
  isNumberArrayLike,
  isRecord,
  roundSvgCoord,
  sanitizeLocalizedSvgId,
  sanitizeSvgId,
  toNumberTuple
} from './svg-values';
import type {
  BinaryAttributeLike,
  BinaryLayerDataLike,
  SvgDeckLayerLike,
  SvgProjectionContext
} from './types';

function transformByModelMatrix(
  position: number[],
  modelMatrix: unknown
): number[] {
  if (!modelMatrix) return position;

  const x = position[0] ?? 0;
  const y = position[1] ?? 0;
  const z = position[2] ?? 0;

  if (isRecord(modelMatrix)) {
    const transformAsPoint = modelMatrix.transformAsPoint;
    if (typeof transformAsPoint === 'function') {
      const transformed = transformAsPoint.call(modelMatrix, [x, y, z]);
      const tuple = toNumberTuple(transformed, 3);
      if (tuple) return tuple;
    }

    const transform = modelMatrix.transform;
    if (typeof transform === 'function') {
      const transformed = transform.call(modelMatrix, [x, y, z]);
      const tuple = toNumberTuple(transformed, 3);
      if (tuple) return tuple;
    }

    const elements = modelMatrix.elements;
    if (isNumberArrayLike(elements) && elements.length >= 16) {
      return multiplyMatrixPosition(elements, x, y, z);
    }
  }

  if (isNumberArrayLike(modelMatrix) && modelMatrix.length >= 16) {
    return multiplyMatrixPosition(modelMatrix, x, y, z);
  }

  return position;
}

function multiplyMatrixPosition(
  matrix: ArrayLike<number>,
  x: number,
  y: number,
  z: number
): number[] {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + (matrix[15] ?? 1);
  const divisor = Number.isFinite(w) && w !== 0 ? w : 1;

  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor
  ];
}

export function projectPosition(
  position: number[],
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): [number, number] | null {
  const props = getLayerProps(layer);
  const transformed = transformByModelMatrix(position, props.modelMatrix);
  let projected: number[] | { x: number; y: number };

  try {
    projected = context.viewport.project(transformed);
  } catch {
    return null;
  }

  const tuple = isNumberArrayLike(projected)
    ? toNumberTuple(projected, 2)
    : isRecord(projected)
      ? [Number(projected.x), Number(projected.y)]
      : null;

  if (!tuple || !Number.isFinite(tuple[0]) || !Number.isFinite(tuple[1])) {
    return null;
  }

  return [context.canvasRect.x + tuple[0], context.canvasRect.y + tuple[1]];
}
export function buildLayerGroup(
  layer: SvgDeckLayerLike,
  index: number,
  content: string,
  dedupeId: SvgIdDeduper,
  idSuffix: string = ''
): string {
  if (!content.trim()) return '';

  const layerId = getLayerId(layer, index);
  const layerType = getLayerTypeName(layer);
  const nameLabel = resolveDeckLayerNameLabel(layerId);
  const baseId = sanitizeLocalizedSvgId(nameLabel);
  const groupId = dedupeId(
    idSuffix ? `${baseId}-${sanitizeSvgId(idSuffix)}` : baseId
  );

  return `
    <g
      id="${escapeXml(groupId)}"
      data-name="${escapeXml(nameLabel)}"
      data-khartis-layer-id="${escapeXml(layerId)}"
      data-khartis-layer-type="${escapeXml(layerType)}"
    >
      ${content}
    </g>
  `;
}
export function buildProjectedPath(
  positionAttribute: BinaryAttributeLike,
  start: number,
  end: number,
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext,
  close: boolean,
  vertexValidAttribute?: BinaryAttributeLike | null
): string {
  const commands: string[] = [];
  let isSubpathOpen = false;

  for (let vertexIndex = start; vertexIndex < end; vertexIndex++) {
    const position = readBinaryTuple(positionAttribute, vertexIndex);
    if (!position) continue;

    const projected = projectPosition(position, layer, context);
    if (!projected) continue;

    commands.push(
      `${isSubpathOpen ? 'L' : 'M'} ${roundSvgCoord(projected[0])} ${roundSvgCoord(projected[1])}`
    );
    isSubpathOpen = true;

    const isRingEnd =
      close &&
      vertexValidAttribute &&
      readBinaryNumber(vertexValidAttribute, vertexIndex, 1) === 0;
    if (isRingEnd) {
      commands.push('Z');
      isSubpathOpen = false;
    }
  }

  if (close && isSubpathOpen) {
    commands.push('Z');
  }

  return commands.join(' ');
}
export function resolveStartIndices(
  data: BinaryLayerDataLike
): ArrayLike<number> | null {
  return isNumberArrayLike(data.startIndices) && data.startIndices.length >= 2
    ? data.startIndices
    : null;
}
