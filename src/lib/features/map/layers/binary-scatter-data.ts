import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { createScatterplotLayerProps } from '@ateliercartographie/geoarrow-deck-stream';

export type ScatterBinaryData = {
  attributes: Record<string, unknown>;
  khartisSourceTable?: ArrowTable;
  length?: number;
  featureIds?: Uint32Array;
};

type NumericArray =
  | number[]
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array;

function createNumericArrayClone(
  source: NumericArray,
  length: number
): NumericArray {
  if (Array.isArray(source)) return new Array<number>(length).fill(0);
  if (source instanceof Float32Array) return new Float32Array(length);
  if (source instanceof Float64Array) return new Float64Array(length);
  if (source instanceof Int8Array) return new Int8Array(length);
  if (source instanceof Uint8Array) return new Uint8Array(length);
  if (source instanceof Uint8ClampedArray) return new Uint8ClampedArray(length);
  if (source instanceof Int16Array) return new Int16Array(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  if (source instanceof Int32Array) return new Int32Array(length);
  return new Uint32Array(length);
}

function isNumericArray(value: unknown): value is NumericArray {
  return (
    Array.isArray(value) ||
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array
  );
}

function reorderNumericArray(
  source: NumericArray,
  order: number[],
  itemSize: number
): NumericArray {
  const out = createNumericArrayClone(source, source.length);
  for (let targetIndex = 0; targetIndex < order.length; targetIndex += 1) {
    const sourceIndex = order[targetIndex];
    for (let component = 0; component < itemSize; component += 1) {
      const from = sourceIndex * itemSize + component;
      const to = targetIndex * itemSize + component;
      out[to] = source[from] ?? 0;
    }
  }
  return out;
}

function reorderBinaryAttribute(
  attribute: unknown,
  order: number[],
  length: number
): unknown {
  if (typeof attribute !== 'object' || attribute === null) return attribute;
  const record = attribute as { value?: unknown; size?: unknown };
  const itemSize = typeof record.size === 'number' ? record.size : 1;
  if (itemSize <= 0 || !isNumericArray(record.value)) return attribute;
  if (record.value.length !== length * itemSize) return attribute;

  return {
    ...record,
    value: reorderNumericArray(record.value, order, itemSize)
  };
}

export function sortScatterBinaryDataByRadius(
  scatterBinaryData: ScatterBinaryData
): void {
  const featureIds = scatterBinaryData.featureIds;
  const radiusAttribute = scatterBinaryData.attributes.getRadius as
    { value?: unknown; size?: unknown } | undefined;
  const radiusValues = radiusAttribute?.value;
  if (
    !featureIds ||
    !radiusAttribute ||
    radiusAttribute.size !== 1 ||
    !isNumericArray(radiusValues) ||
    radiusValues.length !== featureIds.length
  ) {
    return;
  }

  const order = Array.from({ length: featureIds.length }, (_, index) => index);
  order.sort((a, b) => {
    const radiusDelta =
      Number(radiusValues[b] ?? 0) - Number(radiusValues[a] ?? 0);
    return radiusDelta === 0 ? a - b : radiusDelta;
  });

  scatterBinaryData.featureIds = reorderNumericArray(
    featureIds,
    order,
    1
  ) as Uint32Array;
  for (const [key, attribute] of Object.entries(scatterBinaryData.attributes)) {
    scatterBinaryData.attributes[key] = reorderBinaryAttribute(
      attribute,
      order,
      featureIds.length
    );
  }
}

export function cloneScatterBinaryData(
  scatterProps: ReturnType<typeof createScatterplotLayerProps>
): ScatterBinaryData {
  const sourceData = scatterProps.data as ScatterBinaryData;
  const clonedData: ScatterBinaryData = {
    ...sourceData,
    attributes: { ...sourceData.attributes }
  };
  (
    scatterProps as unknown as {
      data: ScatterBinaryData;
    }
  ).data = clonedData;
  return clonedData;
}
