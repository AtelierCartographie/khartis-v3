import { isNumberArrayLike, isRecord, toFiniteNumber } from './svg-values';
import type { BinaryAttributeLike, BinaryLayerDataLike } from './types';

export function getBinaryData(
  props: Record<string, unknown>
): BinaryLayerDataLike | null {
  const data = props.data;
  return isRecord(data) ? (data as BinaryLayerDataLike) : null;
}
export function getBinaryAttribute(
  data: BinaryLayerDataLike | null,
  name: string
): BinaryAttributeLike | null {
  const attribute = data?.attributes?.[name];
  if (!attribute || !isNumberArrayLike(attribute.value)) return null;

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  return { ...attribute, size };
}
export function getBinaryLength(
  data: BinaryLayerDataLike,
  attribute: BinaryAttributeLike
): number {
  if (Number.isFinite(data.length) && (data.length ?? 0) > 0) {
    return Math.floor(data.length ?? 0);
  }

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  const stride = Math.max(size, Math.floor(attribute.stride ?? size));

  return Math.floor((attribute.value?.length ?? 0) / stride);
}
export function readBinaryTuple(
  attribute: BinaryAttributeLike | null,
  index: number
): number[] | null {
  if (!attribute?.value) return null;

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  const stride = Math.max(size, Math.floor(attribute.stride ?? size));
  const offset = Math.max(0, Math.floor(attribute.offset ?? 0));
  const start = offset + index * stride;
  const output: number[] = [];

  for (let itemIndex = 0; itemIndex < size; itemIndex++) {
    const value = Number(attribute.value[start + itemIndex]);
    if (!Number.isFinite(value)) return null;
    output.push(value);
  }

  return output;
}
export function readBinaryNumber(
  attribute: BinaryAttributeLike | null,
  index: number,
  fallback: number
): number {
  const tuple = readBinaryTuple(attribute, index);
  return tuple ? toFiniteNumber(tuple[0], fallback) : fallback;
}

function isPerVertexFeatureAttribute(
  attribute: BinaryAttributeLike,
  startIndices: ArrayLike<number>
): boolean {
  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  const stride = Math.max(size, Math.floor(attribute.stride ?? size));
  const elementCount = Math.floor((attribute.value?.length ?? 0) / stride);
  const vertexCount = Math.floor(Number(startIndices[startIndices.length - 1]));
  const featureCount = startIndices.length - 1;

  return elementCount === vertexCount && vertexCount !== featureCount;
}

export function readFeatureBinaryTuple(
  attribute: BinaryAttributeLike | null,
  index: number,
  startIndices: ArrayLike<number>
): number[] | null {
  if (!attribute) return null;

  const readIndex = isPerVertexFeatureAttribute(attribute, startIndices)
    ? Math.floor(Number(startIndices[index]))
    : index;

  return readBinaryTuple(attribute, readIndex);
}
export function readFeatureId(
  featureIds: ArrayLike<number> | undefined,
  index: number,
  startIndices?: ArrayLike<number>
): number | null {
  if (!featureIds) return null;

  const featureCount = startIndices ? startIndices.length - 1 : -1;
  const vertexCount = startIndices
    ? Math.floor(Number(startIndices[startIndices.length - 1]))
    : -1;
  const isPerVertex =
    Boolean(startIndices) &&
    featureIds.length === vertexCount &&
    vertexCount !== featureCount;
  const readIndex =
    isPerVertex && startIndices
      ? Math.floor(Number(startIndices[index]))
      : index;

  const featureId = Math.floor(Number(featureIds[readIndex]));
  return Number.isInteger(featureId) && featureId >= 0 ? featureId : null;
}
export function getLayerNumber(
  props: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  return toFiniteNumber(props[key], fallback);
}
export function resolveAccessorValue(
  accessor: unknown,
  datum: unknown,
  index: number
): unknown {
  if (typeof accessor !== 'function') {
    return accessor;
  }

  try {
    return (accessor as (item: unknown, info?: { index: number }) => unknown)(
      datum,
      { index }
    );
  } catch {
    return undefined;
  }
}
export function resolveAccessorNumber(
  accessor: unknown,
  datum: unknown,
  index: number,
  fallback: number
): number {
  return toFiniteNumber(resolveAccessorValue(accessor, datum, index), fallback);
}
