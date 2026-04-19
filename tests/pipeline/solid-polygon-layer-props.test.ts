import type { BinaryPolygonData } from 'geoarrow-deck-stream';
import { describe, expect, it } from 'vitest';
import PolygonTesselator from '../../node_modules/@deck.gl/layers/src/solid-polygon-layer/polygon-tesselator';
import { createCompatibleSolidPolygonLayerProps } from '$lib/features/map/utils/solid-polygon-layer-props';

describe('createCompatibleSolidPolygonLayerProps', () => {
  it('normalizes hole masks to Uint16Array for Deck.gl', () => {
    const polygonData: BinaryPolygonData = {
      length: 1,
      positions: new Float32Array([
        0, 0, 4, 0, 4, 4, 0, 4, 1, 1, 3, 1, 3, 3, 1, 3
      ]),
      polygonIndices: new Uint32Array([0, 8]),
      holeIndices: new Uint32Array([0, 4, 8]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      featureIds: new Uint32Array([0]),
      size: 2
    };

    const props = createCompatibleSolidPolygonLayerProps(polygonData);
    const vertexValid = props.data.attributes.instanceVertexValid;

    expect(vertexValid?.value).toBeInstanceOf(Uint16Array);
    expect(Array.from(vertexValid?.value ?? [])).toEqual([
      1, 1, 1, 0, 1, 1, 1, 0
    ]);
  });

  it('avoids the Deck.gl runtime crash by exposing the hole mask as instanceVertexValid', () => {
    const polygonData: BinaryPolygonData = {
      length: 1,
      positions: new Float32Array([
        0, 0, 4, 0, 4, 4, 0, 4, 1, 1, 3, 1, 3, 3, 1, 3
      ]),
      polygonIndices: new Uint32Array([0, 8]),
      holeIndices: new Uint32Array([0, 4, 8]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      featureIds: new Uint32Array([0]),
      size: 2
    };

    const props = createCompatibleSolidPolygonLayerProps(polygonData);

    expect(
      'vertexValid' in
        (props.data.attributes as {
          vertexValid?: unknown;
        })
    ).toBe(false);
    expect(props.data.attributes.instanceVertexValid).toBeDefined();

    const tesselator = new PolygonTesselator({
      IndexType: Uint32Array
    });

    expect(() =>
      tesselator.updateGeometry({
        data: props.data,
        buffers: props.data.attributes,
        geometryBuffer: props.data.attributes.getPolygon,
        normalize: false,
        positionFormat: 'XY'
      })
    ).not.toThrow();
  });
});
