import {
  createSolidPolygonLayerProps,
  type BinaryPolygonData
} from '@ateliercartographie/geoarrow-deck-stream';

type CompatibleDeckBinaryAttribute = {
  value: Float32Array | Uint32Array | Uint16Array | Uint8Array;
  size: number;
  stride?: number;
  offset?: number;
  normalized?: boolean;
};

export type CompatibleSolidPolygonLayerProps = {
  data: {
    length: number;
    startIndices: Uint32Array;
    attributes: {
      getPolygon: CompatibleDeckBinaryAttribute;
      indices?: Uint32Array;
      instanceVertexValid?: CompatibleDeckBinaryAttribute;
    };
  };
  _normalize: false;
};

export function createCompatibleSolidPolygonLayerProps(
  data: BinaryPolygonData
): CompatibleSolidPolygonLayerProps {
  const props = createSolidPolygonLayerProps(
    data
  ) as CompatibleSolidPolygonLayerProps;
  const deckVertexValid = (
    props.data.attributes as {
      vertexValid?: CompatibleDeckBinaryAttribute;
    }
  ).vertexValid;

  if (!deckVertexValid) {
    return props;
  }

  const instanceVertexValid = {
    ...deckVertexValid,
    value:
      deckVertexValid.value instanceof Uint16Array
        ? deckVertexValid.value
        : new Uint16Array(deckVertexValid.value)
  };

  props.data.attributes.instanceVertexValid = instanceVertexValid;
  delete (
    props.data.attributes as { vertexValid?: CompatibleDeckBinaryAttribute }
  ).vertexValid;

  return props;
}
